import { prisma } from "@/lib/prisma";
import { auditChainService } from "./audit-chain.service";
import { ProviderContractsService } from "./provider-contracts.service";
import type { Prisma, ProviderContractStatus } from "@prisma/client";

// ─── DIGITAL CONTRACT LIFECYCLE SERVICE ──────────────────────────────────────
// Implements the contract status machine (spec §4.2), activation rules (§4.3),
// version snapshotting (§4.4), maker-checker segregation (§19), the Phase-1
// activation-gate validation subset (§13), and the intake contract pre-check
// (engine stages 1–2, §6.1–6.2). Everything sensitive is written to the
// immutable audit chain.

const MODULE = "PROVIDER_CONTRACT";

/**
 * Allowed status transitions (spec §4.2). Key = from, value = set of to-states
 * reachable by an explicit user/system action. Automatic lifecycle jobs
 * (auto-activate at startDate, auto-expire past endDate) use the same map.
 */
const TRANSITIONS: Record<ProviderContractStatus, ProviderContractStatus[]> = {
  DRAFT: ["UNDER_REVIEW", "ARCHIVED"],
  UNDER_REVIEW: ["APPROVED", "DRAFT", "PENDING_CLARIFICATION"],
  PENDING_CLARIFICATION: ["UNDER_REVIEW", "DRAFT"],
  APPROVED: ["ACTIVE", "DRAFT"], // withdraw-to-draft before activation only
  ACTIVE: ["SUSPENDED", "TERMINATED", "EXPIRED", "SUPERSEDED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  EXPIRED: ["ARCHIVED"], // renew/extend create new contracts/versions elsewhere
  TERMINATED: ["ARCHIVED"],
  SUPERSEDED: ["ARCHIVED"],
  ARCHIVED: [],
};

export interface ValidationIssue {
  rule: string; // e.g. "V1"
  severity: "ERROR" | "WARNING";
  message: string;
  jump?: string; // UI anchor to the offending field/section
}

export interface ValidationResult {
  ok: boolean; // no ERROR-severity issues
  issues: ValidationIssue[];
}

export class ContractLifecycleService {
  // ── Validation (spec §13, Phase-1 subset) ──────────────────────────────
  /**
   * Run the activation-gate validation suite against a contract. Phase-1 covers
   * the metadata/terms gates (V1–V4, V6, V13, V16); tariff/rule/package gates
   * (V7–V12, V14–V15, V17–V18) land with their phases. Pure/read-only.
   */
  static async validate(tenantId: string, contractId: string): Promise<ValidationResult> {
    const contract = await prisma.providerContract.findUnique({
      where: { id: contractId, tenantId },
      include: {
        contractBranches: true,
        applicability: { where: { isActive: true } },
        tariffLines: { where: { isActive: true } },
      },
    });
    if (!contract) return { ok: false, issues: [{ rule: "V0", severity: "ERROR", message: "Contract not found" }] };

    const issues: ValidationIssue[] = [];
    const err = (rule: string, message: string, jump?: string) => issues.push({ rule, severity: "ERROR", message, jump });
    const warn = (rule: string, message: string, jump?: string) => issues.push({ rule, severity: "WARNING", message, jump });

    // V1 — provider + branch scope; payer or ≥1 applicability row.
    if (contract.branchScope === "LISTED" && contract.contractBranches.length === 0) {
      err("V1", "Branch scope is LISTED but no branches are attached.", "branches");
    }
    if (contract.applicability.length === 0) {
      err("V1", "Contract has no applicability (payer/scheme/plan) rows.", "applicability");
    }

    // V2 — execution status must be FULLY_EXECUTED to activate (override elsewhere).
    if (contract.executionStatus !== "FULLY_EXECUTED") {
      err("V2", `Contract is ${contract.executionStatus}; must be FULLY_EXECUTED to activate (or override with note).`, "overview");
    }

    // V3 — startDate required (schema enforces non-null; guard defensively).
    if (!contract.startDate) err("V3", "Start date is required.", "overview");

    // V4 — endDate ≥ startDate; reviewDueDate within window (W).
    if (contract.endDate && contract.startDate && contract.endDate < contract.startDate) {
      err("V4", "End date is before the start date.", "overview");
    }
    if (contract.reviewDueDate && (contract.reviewDueDate < contract.startDate || contract.reviewDueDate > contract.endDate)) {
      warn("V4", "Review-due date falls outside the effective window.", "overview");
    }

    // V6 — no rateMissing lines on activation. (rateMissing field lands in Phase 2;
    // defensively skip if absent on the row.)
    const missing = contract.tariffLines.filter(t => (t as { rateMissing?: boolean }).rateMissing).length;
    if (missing > 0) err("V6", `${missing} tariff line(s) have a missing/unreadable rate — price or deactivate them.`, "tariffs");

    // V10 — ADDENDUM must reference a parent; parent-not-digitised = warning.
    if (contract.contractType === "ADDENDUM") {
      if (!contract.parentContractId) err("V10", "Addendum must reference a parent contract.", "overview");
      else if (!contract.parentDigitised) warn("V10", "Parent contract is not digitised — controlling terms may be missing.", "overview");
    }

    // V13 — submission window, balance-billing policy, unlisted rule set (defaults allowed but explicit).
    if (contract.submissionWindowDays == null) warn("V13", "Submission window not set — no late-submission enforcement.", "overview");
    if (contract.balanceBillingPolicy == null) warn("V13", "Balance-billing policy not set.", "overview");

    // V16 — currency set; tax inclusivity answered (UNKNOWN allowed, W).
    if (!contract.currency) err("V16", "Currency is required.", "overview");
    if (contract.taxInclusive === "UNKNOWN") warn("V16", "Tax inclusivity is UNKNOWN — confirm before go-live.", "overview");

    return { ok: !issues.some(i => i.severity === "ERROR"), issues };
  }

  // ── Status transitions ─────────────────────────────────────────────────
  private static assertTransition(from: ProviderContractStatus, to: ProviderContractStatus) {
    if (!TRANSITIONS[from]?.includes(to)) {
      throw new Error(`Illegal contract status transition ${from} → ${to}.`);
    }
  }

  private static async logEvent(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string,
    action: string,
    contractId: string,
    payload: Record<string, unknown>,
    description: string,
  ) {
    // audit-chain append uses the shared prisma client; it is safe to call after
    // the mutating tx commits. We call it here (post-mutation) via the outer prisma.
    void tx;
    await auditChainService.append({ actorId, action, module: MODULE, entityType: "ProviderContract", entityId: contractId, payload, tenantId, description });
  }

  /** DRAFT → UNDER_REVIEW. Records the submitter (maker) for later maker≠checker. */
  static async submitForReview(tenantId: string, contractId: string, userId: string) {
    const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!c) throw new Error("Contract not found");
    this.assertTransition(c.status, "UNDER_REVIEW");
    const updated = await prisma.providerContract.update({
      where: { id: contractId },
      data: { status: "UNDER_REVIEW", submittedById: userId, submittedAt: new Date() },
    });
    await this.logEvent(prisma as never, tenantId, userId, "CONTRACT:SUBMITTED_FOR_REVIEW", contractId, { from: c.status }, `Contract ${c.contractNumber} submitted for review`);
    return updated;
  }

  /**
   * UNDER_REVIEW → APPROVED. Enforces maker ≠ checker (spec §19): the approver
   * must differ from both the creator and the submitter. Snapshots a validation
   * report; blocks approval when validation has ERROR issues.
   */
  static async approve(tenantId: string, contractId: string, approverId: string) {
    const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!c) throw new Error("Contract not found");
    this.assertTransition(c.status, "APPROVED");
    if (approverId === c.createdById || approverId === c.submittedById) {
      throw new Error("Segregation of duties: the approver cannot be the contract's creator or submitter.");
    }
    const validation = await this.validate(tenantId, contractId);
    if (!validation.ok) {
      throw new Error(`Contract fails activation validation: ${validation.issues.filter(i => i.severity === "ERROR").map(i => i.message).join("; ")}`);
    }
    const updated = await prisma.providerContract.update({
      where: { id: contractId },
      data: { status: "APPROVED", approvedById: approverId, approvedAt: new Date() },
    });
    await this.logEvent(prisma as never, tenantId, approverId, "CONTRACT:APPROVED", contractId, { validation: validation as never }, `Contract ${c.contractNumber} approved`);
    return updated;
  }

  /** UNDER_REVIEW → PENDING_CLARIFICATION with a reviewer query. */
  static async requestClarification(tenantId: string, contractId: string, reviewerId: string, comment: string) {
    const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!c) throw new Error("Contract not found");
    this.assertTransition(c.status, "PENDING_CLARIFICATION");
    const updated = await prisma.providerContract.update({ where: { id: contractId }, data: { status: "PENDING_CLARIFICATION" } });
    await this.logEvent(prisma as never, tenantId, reviewerId, "CONTRACT:CLARIFICATION_REQUESTED", contractId, { comment }, `Clarification requested on ${c.contractNumber}`);
    return updated;
  }

  /** Reject back to DRAFT from UNDER_REVIEW / PENDING_CLARIFICATION, or withdraw APPROVED → DRAFT. */
  static async returnToDraft(tenantId: string, contractId: string, userId: string, reason?: string) {
    const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!c) throw new Error("Contract not found");
    this.assertTransition(c.status, "DRAFT");
    const updated = await prisma.providerContract.update({
      where: { id: contractId },
      data: { status: "DRAFT", approvedById: null, approvedAt: null },
    });
    await this.logEvent(prisma as never, tenantId, userId, "CONTRACT:RETURNED_TO_DRAFT", contractId, { from: c.status, reason: reason ?? null }, `Contract ${c.contractNumber} returned to draft`);
    return updated;
  }

  /**
   * APPROVED → ACTIVE (spec §4.3). Preconditions: approved; FULLY_EXECUTED (or
   * override flag); validation passes. Backdating past the horizon requires an
   * override (recorded by the caller). Creates/activates version 1 and suspends
   * overlapping ACTIVE contracts for the provider. Returns the activated contract.
   */
  static async activate(
    tenantId: string,
    contractId: string,
    userId: string,
    opts?: { allowUnsigned?: boolean; backdateOverrideId?: string; backdateHorizonDays?: number },
  ) {
    const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!c) throw new Error("Contract not found");
    this.assertTransition(c.status, "ACTIVE");
    if (c.endDate < new Date()) throw new Error("Cannot activate a contract whose end date is in the past. Renew it instead.");

    const validation = await this.validate(tenantId, contractId);
    const blocking = validation.issues.filter(i => i.severity === "ERROR");
    // V2 (unsigned) may be waived by override flag; all other ERRORs are hard.
    const hardBlocks = blocking.filter(i => !(i.rule === "V2" && opts?.allowUnsigned));
    if (hardBlocks.length > 0) {
      throw new Error(`Contract fails activation validation: ${hardBlocks.map(i => i.message).join("; ")}`);
    }

    // Backdating horizon check (default 90 days) — beyond it requires an override.
    const horizon = opts?.backdateHorizonDays ?? 90;
    const backdatedDays = Math.floor((Date.now() - c.startDate.getTime()) / 86_400_000);
    if (backdatedDays > horizon && !opts?.backdateOverrideId) {
      throw new Error(`Contract start date is ${backdatedDays} days in the past (horizon ${horizon}). Backdating requires override CONTRACT_BACKDATE.`);
    }

    const activated = await prisma.$transaction(async tx => {
      // Suspend overlapping ACTIVE contracts for this provider (one governing agreement per period).
      await tx.providerContract.updateMany({
        where: {
          tenantId,
          providerId: c.providerId,
          status: "ACTIVE",
          id: { not: contractId },
          startDate: { lte: c.endDate },
          endDate: { gte: c.startDate },
        },
        data: { status: "SUSPENDED" },
      });

      // Ensure version 1 exists and is ACTIVE; pin the contract's currentVersion.
      let version = await tx.contractVersion.findFirst({ where: { contractId, versionNumber: 1 } });
      if (!version) {
        version = await tx.contractVersion.create({
          data: {
            tenantId,
            contractId,
            versionNumber: 1,
            status: "ACTIVE",
            effectiveFrom: c.startDate,
            createdById: c.createdById,
            approvedById: c.approvedById,
            approvedAt: c.approvedAt,
            snapshot: this.contractSnapshot(c) as never,
          },
        });
        // Pin any unpinned tariff lines to version 1.
        await tx.providerTariff.updateMany({ where: { contractId, versionId: null }, data: { versionId: version.id } });
      } else if (version.status !== "ACTIVE") {
        await tx.contractVersion.update({ where: { id: version.id }, data: { status: "ACTIVE" } });
      }

      const updated = await tx.providerContract.update({
        where: { id: contractId },
        data: { status: "ACTIVE", activatedById: userId, activatedAt: new Date(), currentVersionId: version.id },
      });
      await ProviderContractsService.syncProviderSummary(tx, c.providerId);
      return updated;
    });

    await this.logEvent(prisma as never, tenantId, userId, "CONTRACT:ACTIVATED", contractId, { backdatedDays, backdateOverrideId: opts?.backdateOverrideId ?? null, allowUnsigned: !!opts?.allowUnsigned }, `Contract ${c.contractNumber} activated`);
    return activated;
  }

  static async suspend(tenantId: string, contractId: string, userId: string, reason?: string) {
    return this.simpleTransition(tenantId, contractId, userId, "SUSPENDED", "CONTRACT:SUSPENDED", reason);
  }
  static async reinstate(tenantId: string, contractId: string, userId: string, reason?: string) {
    return this.simpleTransition(tenantId, contractId, userId, "ACTIVE", "CONTRACT:REINSTATED", reason);
  }
  static async terminate(tenantId: string, contractId: string, userId: string, reason?: string) {
    return this.simpleTransition(tenantId, contractId, userId, "TERMINATED", "CONTRACT:TERMINATED", reason);
  }
  static async archive(tenantId: string, contractId: string, userId: string) {
    return this.simpleTransition(tenantId, contractId, userId, "ARCHIVED", "CONTRACT:ARCHIVED");
  }

  private static async simpleTransition(
    tenantId: string,
    contractId: string,
    userId: string,
    to: ProviderContractStatus,
    action: string,
    reason?: string,
  ) {
    const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!c) throw new Error("Contract not found");
    this.assertTransition(c.status, to);
    const updated = await prisma.$transaction(async tx => {
      const u = await tx.providerContract.update({ where: { id: contractId }, data: { status: to } });
      await ProviderContractsService.syncProviderSummary(tx, c.providerId);
      return u;
    });
    await this.logEvent(prisma as never, tenantId, userId, action, contractId, { from: c.status, to, reason: reason ?? null }, `Contract ${c.contractNumber} → ${to}`);
    return updated;
  }

  /** Contract-level operative-field snapshot for versioning/diffing (spec §4.4). */
  static contractSnapshot(c: {
    title: string; contractType: string; startDate: Date; endDate: Date; reviewDueDate: Date | null;
    currency: string; paymentTermDays: number; paymentTermType: string; unlistedServiceRule: string;
    balanceBillingPolicy: string | null; submissionWindowDays: number | null; submissionWindowBasis: string | null;
    taxInclusive: string; reconciliationCadence: string; branchScope: string; executionStatus: string;
  }) {
    return {
      title: c.title, contractType: c.contractType,
      startDate: c.startDate.toISOString(), endDate: c.endDate.toISOString(),
      reviewDueDate: c.reviewDueDate?.toISOString() ?? null,
      currency: c.currency, paymentTermDays: c.paymentTermDays, paymentTermType: c.paymentTermType,
      unlistedServiceRule: c.unlistedServiceRule, balanceBillingPolicy: c.balanceBillingPolicy,
      submissionWindowDays: c.submissionWindowDays, submissionWindowBasis: c.submissionWindowBasis,
      taxInclusive: c.taxInclusive, reconciliationCadence: c.reconciliationCadence,
      branchScope: c.branchScope, executionStatus: c.executionStatus,
    };
  }

  // ── Intake contract pre-check (engine stages 1–2, spec §6.1–6.2, §8.1) ──
  /**
   * Read-only pre-check surfaced at claim capture: is there a matching, valid
   * contract family for this provider/branch/payer on the pricing date? Returns
   * the matched contract summary or a reason code (CON-00x). Full applicability
   * filtering (scheme/plan/member category) arrives with Phase 2/3; Phase 1
   * matches on provider, branch scope, payer, and pricing-date window.
   */
  static async precheck(input: {
    tenantId: string;
    providerId: string;
    providerBranchId?: string | null;
    clientId?: string | null;
    pricingDate: Date;
  }): Promise<{
    matched: boolean;
    reasonCode?: "CON-001" | "CON-002" | "CON-008" | "CON-010";
    message: string;
    contract?: { id: string; contractNumber: string; title: string; versionId: string | null; status: ProviderContractStatus };
  }> {
    const { tenantId, providerId, providerBranchId, clientId, pricingDate } = input;

    // Candidate contracts: ACTIVE (Phase 1) with pricing date in window for this provider.
    const candidates = await prisma.providerContract.findMany({
      where: {
        tenantId,
        providerId,
        status: "ACTIVE",
        startDate: { lte: pricingDate },
        endDate: { gte: pricingDate },
      },
      include: { contractBranches: true, applicability: { where: { isActive: true } } },
      orderBy: { startDate: "desc" },
    });

    if (candidates.length === 0) {
      return { matched: false, reasonCode: "CON-001", message: "No active contract found for this provider on the service date." };
    }

    // Branch scope filter (CON-008).
    const branchOk = candidates.filter(c => {
      if (c.branchScope === "ALL_BRANCHES") return true;
      if (!providerBranchId) return false; // LISTED contract needs a branch on the claim
      return c.contractBranches.some(b => b.branchId === providerBranchId);
    });
    if (branchOk.length === 0) {
      return { matched: false, reasonCode: "CON-008", message: "Provider branch not covered by any active contract." };
    }

    // Payer applicability filter (CON-002). A contract with no applicability rows
    // is treated as payer-agnostic (matches any) — Phase 1 leniency; Phase 2
    // tightens this once applicability capture is mandatory.
    const payerOk = clientId
      ? branchOk.filter(c => c.applicability.length === 0 || c.applicability.some(a => a.clientId === clientId && a.inclusionType === "INCLUDE"))
      : branchOk;
    // EXCLUDE rows always win.
    const notExcluded = clientId
      ? payerOk.filter(c => !c.applicability.some(a => a.clientId === clientId && a.inclusionType === "EXCLUDE"))
      : payerOk;

    if (notExcluded.length === 0) {
      return { matched: false, reasonCode: "CON-002", message: "Provider not contracted for this payer on the service date." };
    }
    if (notExcluded.length > 1) {
      // Prefer a branch-specific (LISTED) contract over ALL_BRANCHES; if still tied → ambiguity.
      const listed = notExcluded.filter(c => c.branchScope === "LISTED");
      const winners = listed.length >= 1 ? listed : notExcluded;
      if (winners.length > 1) {
        return { matched: false, reasonCode: "CON-010", message: "Multiple active contracts match — manual resolution required." };
      }
      const w = winners[0];
      return { matched: true, message: "Matched", contract: { id: w.id, contractNumber: w.contractNumber, title: w.title, versionId: w.currentVersionId, status: w.status } };
    }

    const w = notExcluded[0];
    return { matched: true, message: "Matched", contract: { id: w.id, contractNumber: w.contractNumber, title: w.title, versionId: w.currentVersionId, status: w.status } };
  }
}
