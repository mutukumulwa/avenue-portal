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
  DRAFT: ["UNDER_REVIEW", "ARCHIVED", "VOIDED"], // VOIDED reachable from DRAFT only (PR-010 D2)
  UNDER_REVIEW: ["APPROVED", "DRAFT", "PENDING_CLARIFICATION"],
  PENDING_CLARIFICATION: ["UNDER_REVIEW", "DRAFT"],
  APPROVED: ["ACTIVE", "DRAFT"], // withdraw-to-draft before activation only
  ACTIVE: ["SUSPENDED", "TERMINATED", "EXPIRED", "SUPERSEDED"],
  SUSPENDED: ["ACTIVE", "TERMINATED"],
  EXPIRED: ["ARCHIVED"], // renew/extend create new contracts/versions elsewhere
  TERMINATED: ["ARCHIVED"],
  SUPERSEDED: ["ARCHIVED"],
  ARCHIVED: [],
  VOIDED: [], // terminal — never-delete convention
};

/** Header/commercial fields editable while a contract is in DRAFT (PR-010 D1). */
export const DRAFT_EDITABLE_FIELDS = [
  "title", "contractType", "startDate", "endDate", "reviewDueDate",
  "branchScope", "externalContractRef", "currency", "executionStatus",
  "paymentTermDays", "paymentTermType", "submissionWindowDays", "submissionWindowBasis",
  "balanceBillingPolicy", "taxInclusive", "reconciliationCadence",
  "unlistedServiceRule", "unlistedDiscountPct", "notes",
] as const;
export type DraftEditableField = (typeof DRAFT_EDITABLE_FIELDS)[number];

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
        pricingRules: { where: { isActive: true } },
        contractPackages: { where: { isActive: true }, include: { components: true } },
        preauthRules: { where: { isActive: true } },
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

    // V8 — every package: ≥1 component OR explicit unbundling, trigger defined.
    for (const p of contract.contractPackages) {
      if (p.triggerCodes.length === 0) err("V8", `Package "${p.name}" has no trigger codes.`, "packages");
    }

    // V9 — every pre-auth rule sets consequenceIfMissing + emergencyExempt explicitly (schema enforces).

    // V12 — conflicting pricing rules of equal specificity (same scope + target,
    // overlapping window, different ruleKind) block activation (§7, §13-V12).
    const rules = contract.pricingRules;
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i];
        const b = rules[j];
        const sameTarget =
          a.scope === b.scope &&
          (a.serviceCategoryId ?? null) === (b.serviceCategoryId ?? null) &&
          (a.tariffLineId ?? null) === (b.tariffLineId ?? null);
        const overlap = (a.effectiveTo ?? new Date(8.64e15)) >= b.effectiveFrom && (b.effectiveTo ?? new Date(8.64e15)) >= a.effectiveFrom;
        if (sameTarget && overlap && a.ruleKind !== b.ruleKind) {
          err("V12", `Conflicting pricing rules of equal specificity (${a.ruleKind} vs ${b.ruleKind}) at scope ${a.scope}.`, "rules");
        }
      }
    }

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

  /**
   * PR-010 #1: edit header/commercial fields while DRAFT (or answering
   * clarification). Server-enforced — no edits in UNDER_REVIEW/APPROVED/
   * ACTIVE/SUSPENDED even via direct invocation. Writes an audit event with a
   * field-level before/after diff.
   */
  static async editDraftHeader(
    tenantId: string,
    contractId: string,
    userId: string,
    fields: Partial<Record<DraftEditableField, unknown>>,
  ) {
    const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!c) throw new Error("Contract not found");
    if (!["DRAFT", "PENDING_CLARIFICATION"].includes(c.status)) {
      throw new Error(
        `Header terms can only be edited in DRAFT (current: ${c.status.replace(/_/g, " ")}). ` +
        "Withdraw the contract to draft first, or capture a superseding version.",
      );
    }

    // Whitelist + diff.
    const data: Record<string, unknown> = {};
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of DRAFT_EDITABLE_FIELDS) {
      if (!(key in fields)) continue;
      const after = fields[key];
      const before = (c as Record<string, unknown>)[key];
      const beforeCmp = before instanceof Date ? before.toISOString() : before;
      const afterCmp = after instanceof Date ? after.toISOString() : after;
      if (beforeCmp === afterCmp) continue;
      data[key] = after;
      diff[key] = {
        before: before instanceof Date ? before.toISOString().slice(0, 10) : before,
        after: after instanceof Date ? after.toISOString().slice(0, 10) : after,
      };
    }
    if (Object.keys(data).length === 0) return c;

    if (data.startDate && data.endDate && (data.endDate as Date) <= (data.startDate as Date)) {
      throw new Error("End date must be after the start date.");
    }

    const updated = await prisma.providerContract.update({ where: { id: contractId }, data: data as never });
    await this.logEvent(
      prisma as never, tenantId, userId, "CONTRACT:HEADER_EDITED", contractId,
      { diff },
      `Contract ${c.contractNumber} header edited in ${c.status}: ${Object.keys(diff).join(", ")}`,
    );
    return updated;
  }

  /**
   * PR-010 D2: DRAFT → VOIDED (terminal). Never-delete convention — the record
   * stays for audit but leaves default lists and selection dropdowns. Requires
   * a reason.
   */
  static async voidContract(tenantId: string, contractId: string, userId: string, reason: string) {
    const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
    if (!c) throw new Error("Contract not found");
    this.assertTransition(c.status, "VOIDED");
    if (!reason || reason.trim().length < 5) {
      throw new Error("A void reason is required (min 5 characters).");
    }
    const updated = await prisma.providerContract.update({
      where: { id: contractId },
      data: { status: "VOIDED", notes: c.notes ? `${c.notes}\n\nVOIDED: ${reason}` : `VOIDED: ${reason}` },
    });
    await this.logEvent(
      prisma as never, tenantId, userId, "CONTRACT:VOIDED", contractId,
      { reason, from: c.status },
      `Contract ${c.contractNumber} voided: ${reason}`,
    );
    return updated;
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

  // ── Renewal (spec §4.4) — a NEW contract that supersedes the predecessor ──
  /**
   * Clone a contract into a fresh DRAFT for the next period, carrying forward
   * the FULL definition (tariff lines, applicability, branches, pricing rules,
   * packages, pre-auth/documentation rules, exclusions) with an optional %
   * uplift on all money amounts. Links the old contract via `supersededById`.
   * The renewal is UNSIGNED and DRAFT — it goes through the normal approval path.
   */
  static async renew(
    tenantId: string,
    contractId: string,
    opts: { startDate: Date; endDate: Date; upliftPct: number; userId?: string },
  ) {
    const old = await prisma.providerContract.findUnique({
      where: { id: contractId, tenantId },
      include: {
        tariffLines: { where: { isActive: true } },
        applicability: { where: { isActive: true } },
        contractBranches: true,
        pricingRules: { where: { isActive: true } },
        contractPackages: { where: { isActive: true }, include: { components: true } },
        preauthRules: { where: { isActive: true } },
        documentationRules: { where: { isActive: true } },
        exclusions: true,
      },
    });
    if (!old) throw new Error("Contract not found");
    if (old.supersededById) throw new Error("This contract has already been renewed.");
    if (opts.endDate <= opts.startDate) throw new Error("Renewal end date must be after the start date.");

    const factor = 1 + opts.upliftPct / 100;
    const up = (n: Prisma.Decimal | number | null | undefined): number | null =>
      n == null ? null : Math.round(Number(n) * factor * 100) / 100;
    const contractNumber = await ProviderContractsService.nextContractNumber(tenantId);
    const bumpedTitle = old.title.replace(/\b20\d{2}\b/, String(opts.startDate.getFullYear()));
    const title = bumpedTitle === old.title ? `${old.title} (Renewal)` : bumpedTitle;

    const renewed = await prisma.$transaction(async tx => {
      const c = await tx.providerContract.create({
        data: {
          tenantId,
          providerId: old.providerId,
          contractNumber,
          title,
          contractType: old.contractType,
          status: "DRAFT",
          branchScope: old.branchScope,
          parentContractId: old.parentContractId,
          parentDigitised: old.parentDigitised,
          externalContractRef: old.externalContractRef,
          startDate: opts.startDate,
          endDate: opts.endDate,
          reviewDueDate: null,
          executionStatus: "UNSIGNED", // a renewal must be re-executed
          currency: old.currency,
          country: old.country,
          region: old.region,
          paymentTermDays: old.paymentTermDays,
          paymentTermType: old.paymentTermType,
          creditLimit: old.creditLimit,
          invoiceDiscountPct: old.invoiceDiscountPct,
          earlySettlementDiscountPct: old.earlySettlementDiscountPct,
          earlySettlementWindowDays: old.earlySettlementWindowDays,
          submissionWindowDays: old.submissionWindowDays,
          submissionWindowBasis: old.submissionWindowBasis,
          balanceBillingPolicy: old.balanceBillingPolicy,
          taxInclusive: old.taxInclusive,
          reconciliationCadence: old.reconciliationCadence,
          unlistedServiceRule: old.unlistedServiceRule,
          unlistedDiscountPct: old.unlistedDiscountPct,
          autoRenew: old.autoRenew,
          notes: old.notes,
          createdById: opts.userId,
          contractOwnerId: opts.userId ?? old.contractOwnerId,
        },
      });

      if (old.tariffLines.length) {
        await tx.providerTariff.createMany({
          data: old.tariffLines.map(t => ({
            providerId: old.providerId,
            contractId: c.id,
            branchId: t.branchId,
            clientId: t.clientId,
            cptCode: t.cptCode,
            serviceName: t.serviceName,
            agreedRate: up(t.agreedRate) ?? 0,
            currency: t.currency,
            tariffType: t.tariffType,
            requiresPreauth: t.requiresPreauth,
            maxQuantityPerVisit: t.maxQuantityPerVisit,
            serviceCategoryId: t.serviceCategoryId,
            providerServiceCode: t.providerServiceCode,
            providerDescription: t.providerDescription,
            standardDescription: t.standardDescription,
            codingSystem: t.codingSystem,
            rateType: t.rateType,
            discountPct: t.discountPct,
            markupPct: t.markupPct,
            maxPayableAmount: up(t.maxPayableAmount),
            minPayableAmount: up(t.minPayableAmount),
            unitOfMeasure: t.unitOfMeasure,
            quantityLimit: t.quantityLimit,
            frequencyLimit: t.frequencyLimit,
            frequencyPeriod: t.frequencyPeriod,
            genderRestriction: t.genderRestriction,
            ageMin: t.ageMin,
            ageMax: t.ageMax,
            diagnosisRestriction: t.diagnosisRestriction ?? undefined,
            requiresReferral: t.requiresReferral,
            rateMissing: t.rateMissing,
            externalScheme: t.externalScheme,
            externalRebateAmount: up(t.externalRebateAmount),
            effectiveFrom: opts.startDate,
          })),
        });
      }

      if (old.applicability.length) {
        await tx.contractApplicability.createMany({
          data: old.applicability.map(a => ({
            contractId: c.id,
            clientId: a.clientId,
            groupId: a.groupId,
            packageId: a.packageId,
            packageVersionId: a.packageVersionId,
            benefitCategory: a.benefitCategory,
            networkTier: a.networkTier,
            memberCategory: a.memberCategory,
            inclusionType: a.inclusionType,
          })),
        });
      }

      if (old.contractBranches.length) {
        await tx.contractBranch.createMany({ data: old.contractBranches.map(b => ({ contractId: c.id, branchId: b.branchId })) });
      }

      if (old.pricingRules.length) {
        await tx.pricingRule.createMany({
          data: old.pricingRules.map(r => {
            const params = { ...((r.params ?? {}) as Record<string, unknown>) };
            if (typeof params.rate === "number") params.rate = Math.round(params.rate * factor * 100) / 100;
            return {
              tenantId,
              contractId: c.id,
              scope: r.scope,
              serviceCategoryId: r.serviceCategoryId,
              tariffLineId: r.tariffLineId,
              ruleKind: r.ruleKind,
              params: params as Prisma.InputJsonValue,
              priority: r.priority,
            };
          }),
        });
      }

      for (const p of old.contractPackages) {
        await tx.contractPackage.create({
          data: {
            tenantId,
            contractId: c.id,
            name: p.name,
            code: p.code,
            packagePrice: up(p.packagePrice) ?? 0,
            currency: p.currency,
            netOfExternalScheme: p.netOfExternalScheme,
            externalRebateAmount: up(p.externalRebateAmount),
            triggerType: p.triggerType,
            triggerCodes: p.triggerCodes,
            losAssumptionDays: p.losAssumptionDays,
            losCapDays: p.losCapDays,
            complicationRule: p.complicationRule,
            unbundlingAllowed: p.unbundlingAllowed,
            packageOverridesLineItems: p.packageOverridesLineItems,
            genderRestriction: p.genderRestriction,
            effectiveFrom: opts.startDate,
            components: { create: p.components.map(comp => ({ type: comp.type, description: comp.description, code: comp.code, qtyCap: comp.qtyCap })) },
          },
        });
      }

      if (old.preauthRules.length) {
        await tx.preauthRule.createMany({
          data: old.preauthRules.map(r => ({
            tenantId, contractId: c.id, scope: r.scope, serviceCategoryId: r.serviceCategoryId, tariffLineId: r.tariffLineId,
            packageId: r.packageId, triggerType: r.triggerType, thresholdAmount: r.thresholdAmount, serviceRefs: r.serviceRefs,
            admissionRequired: r.admissionRequired, emergencyExempt: r.emergencyExempt, retrospectiveAllowed: r.retrospectiveAllowed,
            retrospectiveWindowHours: r.retrospectiveWindowHours, approvalSlaHours: r.approvalSlaHours, validityDays: r.validityDays,
            requiredDocumentTypes: r.requiredDocumentTypes, consequenceIfMissing: r.consequenceIfMissing,
          })),
        });
      }

      if (old.documentationRules.length) {
        await tx.documentationRule.createMany({
          data: old.documentationRules.map(r => ({
            tenantId, contractId: c.id, scope: r.scope, serviceCategoryId: r.serviceCategoryId, tariffLineId: r.tariffLineId,
            documentType: r.documentType, mandatory: r.mandatory, appliesWhen: r.appliesWhen ?? undefined, consequenceIfMissing: r.consequenceIfMissing,
          })),
        });
      }

      if (old.exclusions.length) {
        await tx.providerContractExclusion.createMany({
          data: old.exclusions.map(e => ({
            contractId: c.id, cptCode: e.cptCode, serviceName: e.serviceName, reason: e.reason, level: e.level,
            serviceCategoryId: e.serviceCategoryId, icdCodes: e.icdCodes, packageId: e.packageId, memberCategory: e.memberCategory,
            dateFrom: e.dateFrom, dateTo: e.dateTo, appliesToBranchId: e.appliesToBranchId,
          })),
        });
      }

      await tx.providerContract.update({ where: { id: old.id }, data: { supersededById: c.id } });
      return c;
    });

    await this.logEvent(prisma as never, tenantId, opts.userId ?? "system", "CONTRACT:RENEWED", contractId, { renewedInto: renewed.id, contractNumber: renewed.contractNumber, upliftPct: opts.upliftPct }, `Contract ${old.contractNumber} renewed → ${renewed.contractNumber}`);
    return renewed;
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
