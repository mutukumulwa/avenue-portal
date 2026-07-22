/**
 * Claims Autopilot F2.5 — governed policy activation REAL-DB proof (CA-080/081).
 * Maker submits, maker self-approval is blocked, an independent checker activates
 * the version, and the prior approved version is superseded — all against Postgres.
 *
 * OPT-IN gate (never a real DB): AUTOPILOT_TEST_DB === DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { submitPolicyChange, deactivatePolicy } from "@/server/services/claim-autopilot/policy-approval";
import { ApprovalRequestService } from "@/server/services/approval-request.service";
import { effectivePolicyMode } from "@/server/services/claim-autopilot/policy";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F2.5 integration — governed policy activation (maker-checker)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let tenantId: string;
  const MAKER = "user-maker-f25";
  const CHECKER = "user-checker-f25";

  const draftLivePolicy = async (over: Record<string, unknown> = {}) =>
    prisma.autoAdjudicationPolicy.create({
      data: {
        tenantId, clientId: null, mode: "LIVE", status: "DRAFT", currency: "UGX",
        maxAutoApproveAmount: 50000, version: 1, createdById: MAKER,
        allowedSources: ["MANUAL"], allowedServiceTypes: ["OUTPATIENT"], allowedBenefitCategories: ["OUTPATIENT"],
        ...over,
      },
    });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const t = await prisma.tenant.create({ data: { name: "AP Policy Test", slug: `ap-pol-${Date.now()}` } });
    tenantId = t.id;
    // Minimal matrix so ApprovalRequestService.create resolves (no steps ⇒ single checker).
    await prisma.approvalMatrix.create({
      data: { tenantId, actionType: "AUTO_ADJ_POLICY_CHANGE", requiredRole: "SUPER_ADMIN", requiresDual: false, currency: "UGX", effectiveFrom: new Date("2020-01-01"), isActive: true },
    });
  });

  afterAll(async () => {
    if (prisma && tenantId) {
      await prisma.approvalDecision.deleteMany({ where: { request: { tenantId } } });
      await prisma.approvalRequest.deleteMany({ where: { tenantId } });
      await prisma.approvalMatrix.deleteMany({ where: { tenantId } });
      await prisma.autoAdjudicationPolicy.deleteMany({ where: { tenantId } });
      await prisma.tenant.delete({ where: { id: tenantId } });
      await prisma.$disconnect();
    }
  });

  it("maker submits → PENDING_APPROVAL; maker self-approval blocked; checker activates → LIVE", async () => {
    const pol = await draftLivePolicy();
    const { requestId } = await submitPolicyChange(tenantId, pol.id, MAKER);

    const pending = await prisma.autoAdjudicationPolicy.findUniqueOrThrow({ where: { id: pol.id } });
    expect(pending.status).toBe("PENDING_APPROVAL");
    expect(pending.approvalRequestId).toBe(requestId);

    // SoD: the maker cannot approve their own change.
    await expect(
      ApprovalRequestService.decide(tenantId, requestId, { id: MAKER, role: "SUPER_ADMIN" }, "APPROVED"),
    ).rejects.toThrow();

    // An independent checker approves → the dispatch activates the version.
    await ApprovalRequestService.decide(tenantId, requestId, { id: CHECKER, role: "SUPER_ADMIN" }, "APPROVED");

    const approved = await prisma.autoAdjudicationPolicy.findUniqueOrThrow({ where: { id: pol.id } });
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(CHECKER);
    expect(approved.approvedAt).toBeInstanceOf(Date);
    // Now the fail-closed resolver recognises it as LIVE.
    expect(effectivePolicyMode(approved as never)).toBe("LIVE");
  });

  it("approving a new version supersedes the prior approved version in the same scope", async () => {
    const first = await draftLivePolicy({ version: 10 });
    const s1 = await submitPolicyChange(tenantId, first.id, MAKER);
    await ApprovalRequestService.decide(tenantId, s1.requestId, { id: CHECKER, role: "SUPER_ADMIN" }, "APPROVED");
    expect((await prisma.autoAdjudicationPolicy.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("APPROVED");

    const second = await draftLivePolicy({ version: 11 });
    const s2 = await submitPolicyChange(tenantId, second.id, MAKER);
    await ApprovalRequestService.decide(tenantId, s2.requestId, { id: CHECKER, role: "SUPER_ADMIN" }, "APPROVED");

    expect((await prisma.autoAdjudicationPolicy.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("APPROVED");
    expect((await prisma.autoAdjudicationPolicy.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("SUPERSEDED");
  });

  it("rejection leaves the policy non-live", async () => {
    const pol = await draftLivePolicy({ version: 20 });
    const { requestId } = await submitPolicyChange(tenantId, pol.id, MAKER);
    await ApprovalRequestService.decide(tenantId, requestId, { id: CHECKER, role: "SUPER_ADMIN" }, "REJECTED");
    const after = await prisma.autoAdjudicationPolicy.findUniqueOrThrow({ where: { id: pol.id } });
    expect(after.status).toBe("REJECTED"); // returned for correction, never activated
    expect(effectivePolicyMode(after as never)).toBe("OFF");
  });

  it("deactivation is immediate and reason-required", async () => {
    const pol = await draftLivePolicy({ version: 30 });
    const { requestId } = await submitPolicyChange(tenantId, pol.id, MAKER);
    await ApprovalRequestService.decide(tenantId, requestId, { id: CHECKER, role: "SUPER_ADMIN" }, "APPROVED");
    await deactivatePolicy(tenantId, pol.id, CHECKER, "safety: emergency stop");
    const after = await prisma.autoAdjudicationPolicy.findUniqueOrThrow({ where: { id: pol.id } });
    expect(after.status).toBe("DEACTIVATED");
    expect(after.deactivationReason).toBe("safety: emergency stop");
    expect(effectivePolicyMode(after as never)).toBe("OFF");
  });
});
