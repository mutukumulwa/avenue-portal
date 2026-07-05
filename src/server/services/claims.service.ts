import { prisma } from "@/lib/prisma";
import type { ClaimStatus, PreauthStatus, BenefitCategory, ServiceType, Prisma } from "@prisma/client";
import { FraudService } from "./fraud.service";
import { ProviderContractsService, type ResolvedClaimRates } from "./provider-contracts.service";
import { assertServiceDateNotFuture } from "@/lib/service-date";
import { BenefitUsageService } from "./benefit-usage.service";

export class ClaimsService {
  // ─── CLAIMS ─────────────────────────────────────────────

  /**
   * Active claims work-queues (Medvex spec §3.3 / gap G3.3). Returns claims in
   * the pre-terminal lifecycle states for the ops console, scoped to the caller's
   * client when confined. Each carries member/provider/amount/receivedAt so the
   * UI can render SLA timers + drill-through.
   */
  static readonly ACTIVE_QUEUE_STATUSES: ClaimStatus[] = [
    "INCURRED",
    "RECEIVED",
    "CAPTURED",
    "UNDER_REVIEW",
    "APPROVED",
    "PARTIALLY_APPROVED",
  ];

  static async getActiveQueues(
    tenantId: string,
    clientId?: string | null,
    opts?: { take?: number; providerId?: string },
  ) {
    return prisma.claim.findMany({
      where: {
        tenantId,
        status: { in: ClaimsService.ACTIVE_QUEUE_STATUSES },
        ...(opts?.providerId ? { providerId: opts.providerId } : {}),
        ...(clientId ? { member: { group: { clientId } } } : {}),
      },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        source: true,
        serviceType: true,
        dateOfService: true,
        billedAmount: true,
        currency: true,
        receivedAt: true,
        providerId: true,
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
        // Contract-first SLA (WP-A1/D2): payment terms travel with the claim.
        contract: { select: { paymentTermDays: true, paymentTermType: true } },
      },
      orderBy: { receivedAt: "asc" }, // oldest first — SLA-critical ones surface
      ...(opts?.take ? { take: opts.take } : {}),
    });
  }

  /**
   * Facility-level roll-up for the queues console (WP-A1): active-claim counts
   * per provider so the UI can group facility-first and order by workload.
   */
  static async getQueueFacilitySummary(tenantId: string, clientId?: string | null) {
    const grouped = await prisma.claim.groupBy({
      by: ["providerId", "status"],
      where: {
        tenantId,
        status: { in: ClaimsService.ACTIVE_QUEUE_STATUSES },
        ...(clientId ? { member: { group: { clientId } } } : {}),
      },
      _count: { _all: true },
      _min: { receivedAt: true },
    });
    const providerIds = [...new Set(grouped.map((g) => g.providerId))];
    const providers = await prisma.provider.findMany({
      where: { id: { in: providerIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(providers.map((p) => [p.id, p.name]));
    const summary = new Map<
      string,
      { providerId: string; providerName: string; total: number; oldestReceivedAt: Date | null; byStatus: Record<string, number> }
    >();
    for (const g of grouped) {
      const row = summary.get(g.providerId) ?? {
        providerId: g.providerId,
        providerName: nameById.get(g.providerId) ?? "Unknown facility",
        total: 0,
        oldestReceivedAt: null as Date | null,
        byStatus: {} as Record<string, number>,
      };
      row.total += g._count._all;
      row.byStatus[g.status] = (row.byStatus[g.status] ?? 0) + g._count._all;
      if (g._min.receivedAt && (!row.oldestReceivedAt || g._min.receivedAt < row.oldestReceivedAt)) {
        row.oldestReceivedAt = g._min.receivedAt;
      }
      summary.set(g.providerId, row);
    }
    return [...summary.values()].sort((a, b) => b.total - a.total);
  }

  /**
   * List all claims for a tenant with related member/provider data
   */
  static async getClaims(
    tenantId: string,
    status?: ClaimStatus,
    clientId?: string | null,
    opts?: { take?: number; skip?: number; providerId?: string; serviceType?: ServiceType },
  ) {
    return prisma.claim.findMany({
      // Client isolation (G2.1 / G5.6): confined users see only their client's claims.
      where: {
        tenantId,
        ...(status ? { status } : {}),
        ...(opts?.providerId ? { providerId: opts.providerId } : {}),
        ...(opts?.serviceType ? { serviceType: opts.serviceType } : {}),
        ...(clientId ? { member: { group: { clientId } } } : {}),
      },
      include: {
        member:   { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { id: true, name: true, type: true, tier: true } },
        contract: { select: { paymentTermDays: true, paymentTermType: true } },
        _count:   { select: { exceptionLogs: { where: { status: "PENDING" } } } },
      },
      orderBy: { createdAt: "desc" },
      ...(opts?.take ? { take: opts.take } : {}),
      ...(opts?.skip ? { skip: opts.skip } : {}),
    });
  }

  /**
   * Status roll-up for the claims list header (WP-A3) — computed with groupBy
   * so summary cards stay correct regardless of the page loaded.
   */
  static async getClaimStatusCounts(
    tenantId: string,
    clientId?: string | null,
    opts?: { providerId?: string; serviceType?: ServiceType; status?: ClaimStatus },
  ) {
    const grouped = await prisma.claim.groupBy({
      by: ["status"],
      where: {
        tenantId,
        ...(opts?.status ? { status: opts.status } : {}),
        ...(opts?.providerId ? { providerId: opts.providerId } : {}),
        ...(opts?.serviceType ? { serviceType: opts.serviceType } : {}),
        ...(clientId ? { member: { group: { clientId } } } : {}),
      },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
    }
    return { total, byStatus };
  }

  /**
   * Get a single claim with full details
   */
  static async getClaimById(tenantId: string, id: string) {
    return prisma.claim.findUnique({
      where: { id, tenantId },
      include: {
        member: {
          include: {
            group: { select: { id: true, name: true } },
          },
        },
        provider: true,
        preauths: true,
        claimLines: { orderBy: { lineNumber: "asc" } },
        adjudicationLogs: { orderBy: { createdAt: "desc" } },
        exceptionLogs: {
          orderBy: { createdAt: "desc" },
          include: {
            raisedBy:   { select: { firstName: true, lastName: true } },
            resolvedBy: { select: { firstName: true, lastName: true } },
          },
        },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  /**
   * Resolve the contracted position (rate, exclusions, unlisted-service rule,
   * preauth/quantity flags) for every line on a claim.  Does NOT write to the DB.
   */
  static async getClaimTariffVariances(tenantId: string, claimId: string) {
    const resolved = await this.resolveClaimContractRates(tenantId, claimId);
    return resolved.lines;
  }

  /** Full contract-aware resolution incl. the governing contract itself. */
  static async resolveClaimContractRates(tenantId: string, claimId: string): Promise<ResolvedClaimRates> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        dateOfService: true,
        providerId: true,
        member: { select: { group: { select: { clientId: true } } } },
        claimLines: {
          orderBy: { lineNumber: "asc" },
          select: { id: true, cptCode: true, description: true, unitCost: true, quantity: true },
        },
      },
    });
    if (!claim) return { contract: null, lines: [] };

    return ProviderContractsService.resolveClaimLineRates(
      tenantId,
      claim.providerId,
      claim.dateOfService,
      claim.claimLines.map(l => ({
        id: l.id,
        cptCode: l.cptCode,
        description: l.description,
        unitCost: Number(l.unitCost),
        quantity: l.quantity,
      })),
      claim.member?.group?.clientId, // per-client tariff resolution (G5.4)
    );
  }

  /**
   * Submit a new claim
   */
  static async createClaim(tenantId: string, data: {
    memberId: string;
    providerId: string;
    serviceType: ServiceType;
    dateOfService: Date;
    admissionDate?: Date;
    dischargeDate?: Date;
    attendingDoctor?: string;
    diagnoses: Record<string, unknown>[];
    procedures: Record<string, unknown>[];
    billedAmount: number;
    benefitCategory: BenefitCategory;
    source?: string;
    preauthId?: string; // explicitly linked pre-auth
  }) {
    // ── Service-date gate (PR-013) ──────────────────────────────────────────
    // Server-side and channel-independent: the wizard, B2B API and batch
    // imports all pass through here or apply the same shared assertion.
    assertServiceDateNotFuture(new Date(data.dateOfService));

    // ── Pre-auth gate ───────────────────────────────────────────────────────
    const member = await prisma.member.findUnique({
      where: { id: data.memberId },
      select: { packageId: true, packageVersionId: true },
    });
    if (member) {
      // Benefits that always require pre-auth
      const PREAUTH_REQUIRED = ["INPATIENT", "SURGICAL", "MATERNITY"] as const;
      const needsPreauth = (PREAUTH_REQUIRED as readonly string[]).includes(data.benefitCategory);
      if (needsPreauth && !data.preauthId) {
        // Check if there's an approved pre-auth for this member + benefit that hasn't been converted yet
        const linkedPreauth = await prisma.preAuthorization.findFirst({
          where: {
            memberId: data.memberId,
            benefitCategory: data.benefitCategory,
            status: "APPROVED",
            claimId: null,
          },
        });
        if (!linkedPreauth) {
          throw new Error(
            `A pre-authorization is required for ${data.benefitCategory.replace(/_/g, " ")} claims. ` +
            "Please submit and get a pre-auth approved before creating this claim."
          );
        }
        // Auto-link the approved pre-auth
        data.preauthId = linkedPreauth.id;
      }
    }

    // ── Provider gate (PR-006 ratified lifecycle, server-enforced) ──────────
    const provider = await prisma.provider.findUnique({
      where: { id: data.providerId },
      select: { contractStatus: true, name: true, tier: true },
    });
    if (provider && ["EXPIRED", "SUSPENDED"].includes(provider.contractStatus)) {
      throw new Error(
        `Provider "${provider.name}" contract is ${provider.contractStatus}. Claims cannot be submitted against this provider.`
      );
    }
    if (provider && provider.contractStatus === "PENDING") {
      throw new Error(
        `Provider "${provider.name}" is PENDING — it must be activated by an administrator before claims can be submitted against it.`
      );
    }

    // ── Package-level provider eligibility gate ──────────────────────────────
    const memberPkg = await prisma.member.findUnique({
      where: { id: data.memberId },
      select: { packageVersionId: true },
    });
    if (memberPkg?.packageVersionId && provider) {
      const rules = await prisma.packageProviderEligibility.findMany({
        where: { packageVersionId: memberPkg.packageVersionId },
      });
      if (rules.length > 0) {
        const includeRules = rules.filter(r => r.inclusionType === "INCLUDE");
        const excludeRules = rules.filter(r => r.inclusionType === "EXCLUDE");

        const matchesRule = (r: (typeof rules)[number]) =>
          (r.providerId === data.providerId) ||
          (r.providerTier !== null && r.providerTier === provider.tier);

        const isExcluded = excludeRules.some(matchesRule);
        if (isExcluded) {
          throw new Error(
            `Provider "${provider.name}" is explicitly excluded from this member's package. ` +
            "Please direct the member to an eligible facility."
          );
        }

        if (includeRules.length > 0) {
          const isIncluded = includeRules.some(matchesRule);
          if (!isIncluded) {
            throw new Error(
              `Provider "${provider.name}" is not in the list of eligible providers for this member's package. ` +
              "Please direct the member to an eligible facility."
            );
          }
        }
      }
    }

    const count = await prisma.claim.count({ where: { tenantId } });
    const claimNumber = `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    // Calculate length of stay for inpatient
    let lengthOfStay: number | undefined;
    if (data.admissionDate && data.dischargeDate) {
      const diff = new Date(data.dischargeDate).getTime() - new Date(data.admissionDate).getTime();
      lengthOfStay = Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)));
    }

    // ── Claim currency (PR-017 D2) ──────────────────────────────────────────
    // Every claim carries an explicit currency: the provider's ACTIVE contract
    // currency where determinable, else the client's transaction currency,
    // else base. Threshold controls (approval matrix, auto-adjudication
    // ceilings) FX-normalise from this value.
    const currency = await ClaimsService.resolveClaimCurrency(tenantId, data.providerId, data.memberId);

    const created = await prisma.claim.create({
      data: {
        tenantId,
        claimNumber,
        currency,
        memberId: data.memberId,
        providerId: data.providerId,
        // Attach the linked/auto-linked PA (WP-C1). Previously data.preauthId
        // was resolved but never persisted — the link silently went nowhere.
        preauths: data.preauthId ? { connect: [{ id: data.preauthId }] } : undefined,
        serviceType: data.serviceType,
        dateOfService: data.dateOfService,
        admissionDate: data.admissionDate,
        dischargeDate: data.dischargeDate,
        lengthOfStay,
        attendingDoctor: data.attendingDoctor,
        diagnoses: data.diagnoses as Prisma.InputJsonValue,
        procedures: data.procedures as Prisma.InputJsonValue,
        billedAmount: data.billedAmount,
        benefitCategory: data.benefitCategory,
        status: "RECEIVED",
        adjudicationLogs: {
          create: {
            userId: "SYSTEM",
            action: "RECEIVED",
            toStatus: "RECEIVED",
            notes: "Claim submitted for review.",
          },
        },
      },
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
      },
    });

    // Stamp attachment state on any PA connected at create (WP-C2).
    if (data.preauthId) {
      await prisma.preAuthorization.updateMany({
        where: { claimId: created.id, status: "APPROVED" },
        data: { status: "ATTACHED", attachedAt: new Date() },
      });
    }
    return created;
  }

  /**
   * PR-017 D2: provider ACTIVE-contract currency → client currency → base.
   * Shared by every intake channel so no claim is created currency-less.
   */
  static async resolveClaimCurrency(tenantId: string, providerId: string, memberId: string): Promise<string> {
    const contract = await prisma.providerContract.findFirst({
      where: { tenantId, providerId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      select: { currency: true },
    });
    if (contract?.currency) return contract.currency;

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { group: { select: { client: { select: { currency: true } } } } },
    });
    return member?.group?.client?.currency ?? "UGX";
  }

  // ── Claim decisions moved to ClaimDecisionService (W1.1) ──────────────────
  // The former `adjudicateClaim` here and `claimAdjudicationService.approveClaim`
  // were duplicate decision stacks (the systemic root cause behind PR-011/014/
  // 015/016/017/018). Both are retired; the ONLY claim decision entry point is
  // `ClaimDecisionService.decide` — do not re-add a decision method here.

  // ─── PRE-AUTH ATTACHMENT (WP-C2, TPA_FEEDBACK_WORKPLAN.md §C) ────────────

  /**
   * Attach an approved pre-authorization to a claim. The claim keeps its BAU
   * lines; the PA covers the PA-required services within it. Validates member,
   * provider, PA status, validity window, and single-attachment.
   */
  static async attachPreauth(tenantId: string, claimId: string, preauthId: string) {
    const [claim, pa] = await Promise.all([
      prisma.claim.findUnique({
        where: { id: claimId, tenantId },
        select: { id: true, memberId: true, providerId: true, status: true },
      }),
      prisma.preAuthorization.findUnique({
        where: { id: preauthId, tenantId },
        select: {
          id: true, memberId: true, providerId: true, status: true,
          claimId: true, validUntil: true, preauthNumber: true,
        },
      }),
    ]);
    if (!claim) throw new Error("Claim not found");
    if (!pa) throw new Error("Pre-authorization not found");
    if (["PAID", "DECLINED", "VOID"].includes(claim.status)) {
      throw new Error(`Cannot attach a pre-auth to a ${claim.status} claim`);
    }
    if (pa.claimId === claimId) return pa; // already attached here — idempotent
    if (pa.claimId) {
      throw new Error(`Pre-auth ${pa.preauthNumber} is already attached to another claim`);
    }
    if (pa.status !== "APPROVED") {
      throw new Error(`Only APPROVED pre-auths can be attached (current: ${pa.status})`);
    }
    if (pa.memberId !== claim.memberId) {
      throw new Error("Pre-auth belongs to a different member");
    }
    if (pa.providerId !== claim.providerId) {
      throw new Error("Pre-auth was issued for a different facility");
    }
    if (pa.validUntil && pa.validUntil < new Date()) {
      throw new Error(`Pre-auth ${pa.preauthNumber} validity window has passed`);
    }
    return prisma.preAuthorization.update({
      where: { id: preauthId },
      data: { claimId, attachedAt: new Date(), status: "ATTACHED" },
    });
  }

  /** Detach a pre-auth from a claim — reverts it to APPROVED for reuse. */
  static async detachPreauth(tenantId: string, claimId: string, preauthId: string) {
    const pa = await prisma.preAuthorization.findUnique({
      where: { id: preauthId, tenantId },
      select: { id: true, claimId: true, status: true },
    });
    if (!pa || pa.claimId !== claimId) {
      throw new Error("Pre-auth is not attached to this claim");
    }
    if (pa.status === "UTILISED") {
      throw new Error("Pre-auth has been consumed by a claim decision and cannot be detached");
    }
    return prisma.preAuthorization.update({
      where: { id: preauthId },
      data: { claimId: null, attachedAt: null, status: "APPROVED" },
    });
  }

  /**
   * Total PA cover attached to a claim vs its billed amount (WP-C2 cap check —
   * warn, don't block, when the PA-covered portion exceeds approved cover).
   */
  static async getPreauthCoverage(tenantId: string, claimId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        billedAmount: true,
        preauths: { select: { id: true, preauthNumber: true, approvedAmount: true, estimatedCost: true } },
      },
    });
    if (!claim) throw new Error("Claim not found");
    const cover = claim.preauths.reduce(
      (sum, pa) => sum + Number(pa.approvedAmount ?? pa.estimatedCost ?? 0), 0,
    );
    return {
      attachedCount: claim.preauths.length,
      approvedCover: cover,
      billedAmount: Number(claim.billedAmount),
      exceedsCover: claim.preauths.length > 0 && Number(claim.billedAmount) > cover,
    };
  }

  // ─── PRE-AUTHORIZATIONS ─────────────────────────────────

  /**
   * List pre-authorizations
   */
  static async getPreAuthorizations(tenantId: string, status?: PreauthStatus) {
    return prisma.preAuthorization.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single pre-authorization with full details
   */
  static async getPreAuthById(tenantId: string, id: string) {
    return prisma.preAuthorization.findUnique({
      where: { id, tenantId },
      include: {
        member: {
          include: {
            group: { select: { id: true, name: true } },
          },
        },
        provider: true,
        claim: true,
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  /**
   * Submit a pre-authorization request
   */
  static async createPreAuth(tenantId: string, data: {
    memberId: string;
    providerId: string;
    serviceType: ServiceType;
    expectedDateOfService?: Date;
    diagnoses: Record<string, unknown>[];
    procedures: Record<string, unknown>[];
    estimatedCost: number;
    clinicalNotes?: string;
    benefitCategory: BenefitCategory;
    submittedBy: string;
  }) {
    // ── Eligibility gate ────────────────────────────────────────────────────
    const member = await prisma.member.findUnique({
      where: { id: data.memberId, tenantId },
      include: { group: { select: { status: true, name: true } } },
    });
    if (!member) throw new Error("Member not found");

    const BLOCKED = ["SUSPENDED", "LAPSED", "TERMINATED"];
    if (BLOCKED.includes(member.status)) {
      throw new Error(
        `Cannot submit pre-authorisation: member ${member.firstName} ${member.lastName} is ${member.status}.`
      );
    }
    if (member.group && BLOCKED.includes(member.group.status)) {
      throw new Error(
        `Cannot submit pre-authorisation: group "${member.group.name}" is ${member.group.status}.`
      );
    }

    // Provider gate (PR-006): PA requests are new encounters — only ACTIVE
    // providers accept them (server-enforced, matching the dropdown rule).
    const paProvider = await prisma.provider.findUnique({
      where: { id: data.providerId },
      select: { contractStatus: true, name: true },
    });
    if (paProvider && !["ACTIVE"].includes(paProvider.contractStatus)) {
      throw new Error(
        `Provider "${paProvider.name}" is ${paProvider.contractStatus} — pre-authorisations can only be requested at ACTIVE providers.`
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Fraud pre-auth screen (CRITICAL rules throw; others return warnings) ─
    const fraudWarnings = await FraudService.evaluatePreAuth({
      memberId: data.memberId,
      providerId: data.providerId,
      serviceType: data.serviceType,
      expectedDateOfService: data.expectedDateOfService,
      estimatedCost: data.estimatedCost,
      procedures: data.procedures as Array<{ description?: string; cptCode?: string }>,
      memberGender: member.gender,
      tenantId,
    });
    // ────────────────────────────────────────────────────────────────────────

    // ── Benefit-in-package gate (PR-024): validate at REQUEST time, not at
    // claim decision. Approving a PA for a benefit the member doesn't hold
    // creates a phantom hold and a claim that can never be approved.
    const benefitCfg = await BenefitUsageService.resolveConfig(prisma, data.memberId, data.benefitCategory);
    if (!benefitCfg) {
      throw new Error(
        `Benefit "${String(data.benefitCategory).replace(/_/g, " ")}" is not in this member's package — ` +
        `a pre-authorization against it could never pay. Pick a benefit category from the member's package.`,
      );
    }

    const count = await prisma.preAuthorization.count({ where: { tenantId } });
    const preauthNumber = `PA-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const preauth = await prisma.preAuthorization.create({
      data: {
        tenantId,
        preauthNumber,
        memberId: data.memberId,
        providerId: data.providerId,
        serviceType: data.serviceType,
        expectedDateOfService: data.expectedDateOfService,
        diagnoses: data.diagnoses as Prisma.InputJsonValue,
        procedures: data.procedures as Prisma.InputJsonValue,
        estimatedCost: data.estimatedCost,
        clinicalNotes: data.clinicalNotes,
        benefitCategory: data.benefitCategory,
        submittedBy: data.submittedBy,
        status: "SUBMITTED",
      },
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
      },
    });

    return { preauth, warnings: fraudWarnings };
  }

  /**
   * Stage 1 of two-stage review: move a SUBMITTED inpatient pre-auth to UNDER_REVIEW.
   */
  static async markPreAuthUnderReview(tenantId: string, preauthId: string) {
    const preauth = await prisma.preAuthorization.findUnique({
      where: { id: preauthId, tenantId },
    });
    if (!preauth) throw new Error("Pre-authorization not found");
    if (preauth.status !== "SUBMITTED") {
      throw new Error("Pre-authorization is not in SUBMITTED status");
    }
    return prisma.preAuthorization.update({
      where: { id: preauthId },
      data: { status: "UNDER_REVIEW" },
    });
  }

  // ── Pre-auth decisions moved to preauthAdjudicationService (W1.1) ─────────
  // The former `adjudicatePreAuth` here bypassed BenefitHold creation entirely
  // (defect PR-011). The ONLY pre-auth decision entry points are
  // `preauthAdjudicationService.approveByHuman` / `declineByHuman` (which
  // always place/release the hold) and `executeAutoDecision`.

  /**
   * Create an ordinary claim shell with this pre-auth ATTACHED (WP-C2/D4).
   * Replaces the legacy 1:1 "conversion": the claim starts from the PA's
   * clinical picture but remains a normal claim that can accrue BAU lines and
   * further PAs. The PA becomes ATTACHED, not CONVERTED_TO_CLAIM.
   */
  static async createClaimWithPreauth(tenantId: string, preauthId: string) {
    const preauth = await prisma.preAuthorization.findUnique({
      where: { id: preauthId, tenantId },
    });

    if (!preauth) throw new Error("Pre-authorization not found");
    if (preauth.status !== "APPROVED") {
      throw new Error("Only approved pre-authorizations can start a claim");
    }
    if (preauth.claimId) {
      throw new Error("Pre-authorization is already attached to a claim");
    }

    // A PA's expected DOS is prospective; the claim starts when service actually
    // happens — never in the future (PR-013).
    const now = new Date();
    const expected = preauth.expectedDateOfService;
    const claim = await this.createClaim(tenantId, {
      memberId: preauth.memberId,
      providerId: preauth.providerId,
      serviceType: preauth.serviceType,
      dateOfService: expected && expected < now ? expected : now,
      diagnoses: preauth.diagnoses as Record<string, unknown>[],
      procedures: preauth.procedures as Record<string, unknown>[],
      billedAmount: Number(preauth.approvedAmount ?? preauth.estimatedCost),
      benefitCategory: preauth.benefitCategory,
      source: "PREAUTH",
      preauthId: preauth.id,
    });

    // createClaim connected the PA; stamp attachment state explicitly.
    await prisma.preAuthorization.update({
      where: { id: preauthId },
      data: { claimId: claim.id, attachedAt: new Date(), status: "ATTACHED" },
    });

    return claim;
  }

  /** @deprecated WP-C2 — use createClaimWithPreauth; kept for API compatibility. */
  static async convertPreAuthToClaim(tenantId: string, preauthId: string) {
    return this.createClaimWithPreauth(tenantId, preauthId);
  }
}
