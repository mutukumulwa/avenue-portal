import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import type { ApprovalActionType, ServiceType, BenefitCategory } from "@prisma/client";
import { ApprovalMatrixService } from "./approval-matrix.service";

/**
 * Runtime approval workflow (Medvex spec §3.1 / gap G3.1).
 *
 * Persists an ApprovalRequest for a governed action, resolving the matrix rule
 * (version-in-force) and normalised base amount at creation, then walks the
 * sequential ApprovalStep levels — recording each ApprovalDecision with enforced
 * segregation of duties — until the last level approves or any level rejects.
 */
export class ApprovalRequestService {
  /**
   * Open an approval request for an action. Returns the request, or null when
   * no matrix rule applies (caller proceeds without extra approval).
   */
  static async create(
    tenantId: string,
    input: {
      actionType: ApprovalActionType;
      entityType: string;
      entityId: string;
      makerId: string;
      clientId?: string | null;
      amount?: number | null;
      currency?: string | null;
      serviceType?: ServiceType | null;
      benefitCategory?: BenefitCategory | null;
    },
  ) {
    const resolved = await ApprovalMatrixService.resolve(tenantId, {
      actionType: input.actionType,
      clientId: input.clientId,
      amount: input.amount,
      currency: input.currency,
      serviceType: input.serviceType,
      benefitCategory: input.benefitCategory,
    });
    if (!resolved) return null;

    return prisma.approvalRequest.create({
      data: {
        tenantId,
        clientId: input.clientId ?? null,
        actionType: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId,
        amount: input.amount ?? null,
        currency: input.currency ?? "UGX",
        baseAmount: resolved.baseAmount ?? null,
        matrixId: resolved.matrix.id,
        makerId: input.makerId,
        status: "PENDING",
        currentLevel: 1,
      },
    });
  }

  /**
   * Record a decision on the current level. Enforces SoD (checker ≠ maker and
   * ≠ any prior decider) and that the checker's role satisfies the level. An
   * APPROVED at the last level finalises the request; earlier levels advance;
   * a REJECTED at any level finalises as REJECTED.
   */
  static async decide(
    tenantId: string,
    requestId: string,
    checker: { id: string; role: string | null },
    decision: "APPROVED" | "REJECTED",
    notes?: string,
  ) {
    const req = await prisma.approvalRequest.findFirst({
      where: { id: requestId, tenantId },
      include: { matrix: { include: { steps: true } }, decisions: true },
    });
    if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Approval request not found." });
    if (req.status !== "PENDING" && req.status !== "ESCALATED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Request is already finalised." });
    }

    // Segregation of duties: not the maker, and not a prior decider.
    ApprovalMatrixService.enforceSegregationOfDuties(req.makerId, checker.id);
    if (req.decisions.some((d) => d.decidedById === checker.id)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You have already decided on this request." });
    }

    const steps = req.matrix ? ApprovalMatrixService.expandSteps(req.matrix) : [];
    const step = steps.find((s) => s.level === req.currentLevel);
    if (step && !ApprovalMatrixService.roleAuthorised(checker.role, step.requiredRole)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `This level requires ${step.requiredRole.replace(/_/g, " ")} or above.`,
      });
    }

    const isLastLevel = steps.length === 0 || req.currentLevel >= steps.length;
    const nextStatus = decision === "REJECTED" ? "REJECTED" : isLastLevel ? "APPROVED" : "PENDING";

    await prisma.$transaction([
      prisma.approvalDecision.create({
        data: { requestId, level: req.currentLevel, decidedById: checker.id, decision, notes },
      }),
      prisma.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          currentLevel: nextStatus === "PENDING" ? req.currentLevel + 1 : req.currentLevel,
        },
      }),
    ]);

    return prisma.approvalRequest.findUnique({ where: { id: requestId } });
  }
}
