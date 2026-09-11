import "server-only";

/**
 * Family Hospital UAT plan P02.01 — the ONE provider case-context resolver.
 *
 * Every provider capture path (new claim, correction, resubmission, pre-auth,
 * amendment) and the eligibility hand-off resolve "who is this patient, at which
 * branch, on which date, under which contract, in which currency" here — and
 * the submit path resolves it AGAIN, because a client-side display is never
 * authority (plan §4 rule 3).
 *
 * Composition, not re-implementation:
 *   - member + eligibility: `ProviderEligibilityService.check` — the exact
 *     entitlement-scoped, non-enumerating logic the eligibility screen uses;
 *   - contract: `ContractLifecycleService.precheck` — the contract engine's own
 *     stage 1–2 (branch scope, payer applicability, CON-010 ambiguity);
 *   - scope: tenant, provider, actor, permissions and permitted branches from
 *     the session (`ProviderAccessContext`), never from the request.
 *
 * Minimum necessary: the client DTO carries a safe display name, a masked
 * member number, cover status and scheme/package names — no DOB, phone, email,
 * address or diagnoses. A member outside this facility's entitlement is
 * indistinguishable from one that does not exist.
 */
import { randomUUID } from "node:crypto";
import type { BenefitCategory, UnlistedServiceRule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFutureServiceDate, FUTURE_SERVICE_DATE_ERROR, operatingTodayISO } from "@/lib/service-date";
import { isProviderBenefit } from "@/lib/provider-benefit-options";
import {
  CAPTURE_PERMISSION,
  CAPTURE_PURPOSES,
  type CapturePurpose,
  type CaseContextDTO,
  type CaseContextRef,
  type CaseContextRequest,
  type CaseContextResult,
  type UnlistedPolicy,
} from "@/lib/provider-capture-contract";
import type { ProviderAccessContext } from "./provider-access.service";
import { ProviderEligibilityService } from "./provider-eligibility.service";
import { ProviderEntitlementService } from "./provider-entitlement.service";
import { ProviderAccessSettingsService } from "./provider-access-settings.service";
import { captureEvent } from "./capture-telemetry";

/** What the server — and only the server — keeps about a resolved case. */
export interface TrustedCaseContext {
  tenantId: string;
  providerId: string;
  actorId: string;
  purpose: CapturePurpose;
  memberId: string;
  clientId: string | null;
  branchId: string;
  serviceDate: Date;
  serviceDateIso: string;
  benefitCategory: BenefitCategory;
  eligible: boolean;
  contractId: string | null;
  contractVersionId: string | null;
  currency: string | null;
  unlistedServiceRule: UnlistedServiceRule | null;
  unlistedDiscountPct: string | null;
  catalogueEnabled: boolean;
}

export type ResolvedCase = { result: CaseContextResult; trusted: TrustedCaseContext | null };

const MEMBER_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9\-/. ]{0,63}$/;

/** "TST-2026-00001" → "•••• 0001". Shows enough to confirm the card, no more. */
export function maskMemberNumber(memberNumber: string): string {
  const compact = memberNumber.replace(/\s+/g, "");
  return compact.length <= 4 ? "••••" : `•••• ${compact.slice(-4)}`;
}

/** Strict Kampala calendar date → the UTC-midnight instant claims store. */
export function parseServiceDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

export function unlistedPolicyFor(rule: UnlistedServiceRule | null, discountPct: string | null): UnlistedPolicy {
  switch (rule) {
    case "REJECT":
      return { allowed: false, rule, label: "This contract does not pay for services outside the price list." };
    case "PAY_AS_BILLED":
      return { allowed: true, rule, label: "Not in contracted tariff — the contract pays unlisted services as billed." };
    case "DISCOUNT_OFF_BILLED":
      return { allowed: true, rule, label: `Not in contracted tariff — the contract pays unlisted services at billed less ${discountPct ?? "0"}%.` };
    case "REFER_FOR_REVIEW":
      return { allowed: true, rule, label: "Not in contracted tariff — manual review." };
    default:
      return { allowed: false, rule: "NONE", label: "No active contract — services cannot be captured." };
  }
}

function fail(
  outcome: "NOT_FOUND" | "FORBIDDEN" | "BRANCH_REQUIRED" | "INVALID" | "UNAVAILABLE",
  message: string,
  correlationId: string,
  extra: { fieldErrors?: Record<string, string>; branches?: Array<{ id: string; name: string }> } = {},
): ResolvedCase {
  return { result: { outcome, message, correlationId, ...extra }, trusted: null };
}

interface Validated {
  purpose: CapturePurpose;
  serviceDate: Date;
  serviceDateIso: string;
  benefitCategory: BenefitCategory;
}

function validateCommon(ctx: ProviderAccessContext, input: { purpose: unknown; serviceDate: unknown; benefitCategory: unknown }, correlationId: string): Validated | ResolvedCase {
  if (typeof input.purpose !== "string" || !(CAPTURE_PURPOSES as readonly string[]).includes(input.purpose)) {
    return fail("INVALID", "This request is not recognised.", correlationId);
  }
  const purpose = input.purpose as CapturePurpose;
  if (!ctx.permissions.includes(CAPTURE_PERMISSION[purpose])) {
    return fail("FORBIDDEN", "You do not have permission to do this.", correlationId);
  }
  const serviceDateIso = typeof input.serviceDate === "string" ? input.serviceDate.trim() : "";
  const serviceDate = parseServiceDate(serviceDateIso);
  if (!serviceDate) {
    return fail("INVALID", "Enter a valid service date.", correlationId, { fieldErrors: { serviceDate: "Enter a valid service date." } });
  }
  // A claim or an eligibility check is for a service already given; a
  // pre-authorisation is requested for a PLANNED one, so its expected date may
  // be later than today (the pre-auth intake has always accepted that).
  if (purpose !== "PREAUTH" && isFutureServiceDate(serviceDate)) {
    return fail("INVALID", FUTURE_SERVICE_DATE_ERROR, correlationId, { fieldErrors: { serviceDate: FUTURE_SERVICE_DATE_ERROR } });
  }
  if (!isProviderBenefit(input.benefitCategory)) {
    return fail("INVALID", "Choose a benefit.", correlationId, { fieldErrors: { benefitCategory: "Choose a benefit." } });
  }
  return { purpose, serviceDate, serviceDateIso, benefitCategory: input.benefitCategory };
}

/** The branch must be one of the user's permitted, active branches (§4 rule 4). */
async function resolveBranch(
  ctx: ProviderAccessContext,
  requested: string | null | undefined,
  correlationId: string,
): Promise<{ id: string; name: string } | ResolvedCase> {
  const branches = await prisma.providerBranch.findMany({
    where: { tenantId: ctx.tenantId, providerId: ctx.providerId, isActive: true, id: { in: ctx.allowedProviderBranchIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (requested) {
    const hit = branches.find((b) => b.id === requested);
    return hit ?? fail("FORBIDDEN", "That branch is not available to your account.", correlationId, { fieldErrors: { branchId: "Choose one of your branches." } });
  }
  if (branches.length === 1) return branches[0];
  if (branches.length === 0) {
    return fail("FORBIDDEN", "Your account is not assigned to an active branch of this facility. Ask your facility administrator.", correlationId);
  }
  return fail("BRANCH_REQUIRED", "Choose the branch where the patient is being seen.", correlationId, { branches, fieldErrors: { branchId: "Choose a branch." } });
}

async function loadContractTerms(contractId: string) {
  return prisma.providerContract.findUnique({
    where: { id: contractId },
    select: { id: true, contractNumber: true, currentVersionId: true, currency: true, unlistedServiceRule: true, unlistedDiscountPct: true },
  });
}

async function contractFor(
  ctx: ProviderAccessContext,
  branchId: string,
  clientId: string | null,
  serviceDate: Date,
) {
  // Dynamic import keeps the lifecycle service (and its imports) off this
  // module's static graph; it is only needed once a member resolves.
  const { ContractLifecycleService } = await import("./contract-lifecycle.service");
  const match = await ContractLifecycleService.precheck({ tenantId: ctx.tenantId, providerId: ctx.providerId, providerBranchId: branchId, clientId, pricingDate: serviceDate });
  const terms = match.matched && match.contract ? await loadContractTerms(match.contract.id) : null;
  return { match, terms };
}

export const ProviderCaseContextService = {
  /**
   * Full resolution, including the eligibility verdict (which records a
   * point-in-time evidence row exactly as the eligibility screen does). Used on
   * "Find member", on the eligibility hand-off and again on submit.
   */
  async resolve(ctx: ProviderAccessContext, input: CaseContextRequest): Promise<ResolvedCase> {
    const correlationId = ctx.requestId ?? randomUUID();
    const started = Date.now();
    try {
      const v = validateCommon(ctx, input, correlationId);
      if ("result" in v) return v;

      const branch = await resolveBranch(ctx, input.branchId, correlationId);
      if ("result" in branch) return branch;

      // The member number: typed, or recovered from an opaque reference within
      // this facility's entitlement (a foreign reference resolves to nothing).
      let memberNumber = typeof input.memberNumber === "string" ? input.memberNumber.trim() : "";
      if (!memberNumber && typeof input.memberRef === "string" && input.memberRef) {
        const scope = await ProviderEntitlementService.entitledMemberWhere(ctx.providerId, v.serviceDate);
        const byRef = await prisma.member.findFirst({ where: { id: input.memberRef, tenantId: ctx.tenantId, ...scope }, select: { memberNumber: true } });
        if (!byRef) return fail("NOT_FOUND", "No member found for that number. Check the card and try again.", correlationId, { fieldErrors: { memberNumber: "No member found." } });
        memberNumber = byRef.memberNumber;
      }
      if (!memberNumber) {
        return fail("INVALID", "Enter the member/card number.", correlationId, { fieldErrors: { memberNumber: "Enter the member/card number." } });
      }
      if (!MEMBER_NUMBER_RE.test(memberNumber)) {
        return fail("INVALID", "That does not look like a member/card number.", correlationId, { fieldErrors: { memberNumber: "Check the member/card number." } });
      }

      const check = await ProviderEligibilityService.check({
        ctx,
        memberNumber,
        providerBranchId: branch.id,
        serviceDate: v.serviceDate,
        benefitCategory: v.benefitCategory,
      });

      if (!check.found || !check.memberId || !check.member) {
        const reason = check.decision.reasonCode;
        captureEvent("member_resolution", { correlationId, tenantId: ctx.tenantId, providerId: ctx.providerId, purpose: v.purpose, outcome: "NOT_FOUND", reasonCode: reason, durationMs: Date.now() - started });
        // A facility entitled to nobody (or suspended) is a facility problem, not a card problem.
        if (reason === "PROVIDER_NOT_ENTITLED" || check.resultCode === "OUT_OF_NETWORK") {
          return fail("FORBIDDEN", "Your facility cannot confirm cover for this patient right now. Contact Medvex.", correlationId);
        }
        return fail("NOT_FOUND", "No member found for that number. Check the card and try again.", correlationId, { fieldErrors: { memberNumber: "No member found." } });
      }

      const memberRow = await prisma.member.findFirst({
        where: { id: check.memberId, tenantId: ctx.tenantId },
        select: { group: { select: { clientId: true } } },
      });
      const clientId = memberRow?.group?.clientId ?? null;
      const { match, terms } = await contractFor(ctx, branch.id, clientId, v.serviceDate);
      const catalogueEnabled = await ProviderAccessSettingsService.isTariffCatalogEnabled(ctx.tenantId, ctx.providerId);
      const eligible = check.resultCode === "ELIGIBLE";

      const dto: CaseContextDTO = {
        memberRef: check.memberId,
        displayName: `${check.member.firstName} ${check.member.lastName}`.trim(),
        maskedMemberNumber: maskMemberNumber(check.member.memberNumber),
        eligibility: {
          eligible,
          reasonCode: check.decision.reasonCode,
          message: eligible ? "Covered on this date." : [check.decision.memberSafeExplanation, check.decision.operatorGuidance].filter(Boolean).join(" "),
        },
        schemeName: check.schemeName ?? null,
        packageName: check.packageName ?? null,
        branch,
        contract: terms ? { id: terms.id, number: terms.contractNumber, versionId: terms.currentVersionId } : null,
        currency: terms?.currency ?? null,
        serviceDate: v.serviceDateIso,
        benefitCategory: v.benefitCategory,
        catalogueEnabled: catalogueEnabled && !!terms,
        unlisted: unlistedPolicyFor(terms?.unlistedServiceRule ?? null, terms?.unlistedDiscountPct?.toString() ?? null),
      };
      const trusted: TrustedCaseContext = {
        tenantId: ctx.tenantId,
        providerId: ctx.providerId,
        actorId: ctx.actorId,
        purpose: v.purpose,
        memberId: check.memberId,
        clientId,
        branchId: branch.id,
        serviceDate: v.serviceDate,
        serviceDateIso: v.serviceDateIso,
        benefitCategory: v.benefitCategory,
        eligible,
        contractId: terms?.id ?? null,
        contractVersionId: terms?.currentVersionId ?? null,
        currency: terms?.currency ?? null,
        unlistedServiceRule: terms?.unlistedServiceRule ?? null,
        unlistedDiscountPct: terms?.unlistedDiscountPct?.toString() ?? null,
        catalogueEnabled: dto.catalogueEnabled,
      };

      if (!terms) {
        const outcome = match.reasonCode === "CON-010" ? "AMBIGUOUS_CONTRACT" : "NO_ACTIVE_CONTRACT";
        captureEvent("contract_resolution_failed", { correlationId, tenantId: ctx.tenantId, providerId: ctx.providerId, purpose: v.purpose, outcome, reasonCode: match.reasonCode ?? null });
        const message =
          outcome === "AMBIGUOUS_CONTRACT"
            ? "More than one active contract covers this patient's scheme at this branch on this date, so no price can be applied. Contact Medvex."
            : "No active contract covers this patient's scheme at this branch on this date. Contact Medvex.";
        return { result: { outcome, context: dto, message, correlationId }, trusted };
      }

      captureEvent("member_resolution", { correlationId, tenantId: ctx.tenantId, providerId: ctx.providerId, purpose: v.purpose, outcome: eligible ? "RESOLVED" : "INELIGIBLE", reasonCode: check.decision.reasonCode, durationMs: Date.now() - started });
      if (!eligible) {
        return { result: { outcome: "INELIGIBLE", context: dto, message: dto.eligibility.message, correlationId }, trusted };
      }
      return { result: { outcome: "RESOLVED", context: dto, correlationId }, trusted };
    } catch {
      captureEvent("member_resolution", { correlationId, tenantId: ctx.tenantId, providerId: ctx.providerId, outcome: "UNAVAILABLE", durationMs: Date.now() - started });
      return fail("UNAVAILABLE", "Member lookup is temporarily unavailable. Try again shortly.", correlationId);
    }
  },

  /**
   * P02.02 / P04.04 — the eligibility → claim hand-off. The link carries only
   * the eligibility check's id (an opaque evidence reference that expires);
   * this reads that row, READ-ONLY, scoped to the caller's tenant and provider,
   * and returns what the form needs to re-resolve the case through the action.
   * A foreign, stale or malformed reference returns null — the form simply
   * starts empty.
   */
  async handoffFromEligibilityCheck(
    ctx: ProviderAccessContext,
    checkId: unknown,
  ): Promise<{ memberRef: string; branchId: string | null; serviceDate: string; benefitCategory: BenefitCategory | null } | null> {
    if (typeof checkId !== "string" || !/^[A-Za-z0-9_-]{10,64}$/.test(checkId)) return null;
    const row = await prisma.providerEligibilityCheck.findFirst({
      where: {
        id: checkId,
        tenantId: ctx.tenantId,
        providerId: ctx.providerId,
        memberId: { not: null },
        resultCode: "ELIGIBLE",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { memberId: true, providerBranchId: true, requestedServiceDate: true, benefitCategory: true },
    });
    if (!row?.memberId) return null;
    return {
      memberRef: row.memberId,
      branchId: row.providerBranchId && ctx.allowedProviderBranchIds.includes(row.providerBranchId) ? row.providerBranchId : null,
      // The Kampala calendar day of the stored instant: a check made with a blank
      // date stored "now", which near UTC midnight is a different Kampala day.
      serviceDate: operatingTodayISO(row.requestedServiceDate),
      benefitCategory: isProviderBenefit(row.benefitCategory) ? row.benefitCategory : null,
    };
  },

  /**
   * Light reconstruction for type-ahead search: permission, date, branch,
   * member-in-entitlement and contract — WITHOUT an eligibility evidence row
   * per keystroke. Search is never authority; submit calls `resolve()` again.
   */
  async reconstruct(ctx: ProviderAccessContext, ref: CaseContextRef): Promise<TrustedCaseContext | null> {
    const correlationId = ctx.requestId ?? randomUUID();
    const v = validateCommon(ctx, ref, correlationId);
    if ("result" in v) return null;
    if (typeof ref.branchId !== "string" || typeof ref.memberRef !== "string") return null;
    const branch = await resolveBranch(ctx, ref.branchId, correlationId);
    if ("result" in branch) return null;
    const scope = await ProviderEntitlementService.entitledMemberWhere(ctx.providerId, v.serviceDate);
    const member = await prisma.member.findFirst({
      where: { id: ref.memberRef, tenantId: ctx.tenantId, ...scope },
      select: { id: true, group: { select: { clientId: true } } },
    });
    if (!member) return null;
    const clientId = member.group?.clientId ?? null;
    const { terms } = await contractFor(ctx, branch.id, clientId, v.serviceDate);
    if (!terms) return null;
    const catalogueEnabled = await ProviderAccessSettingsService.isTariffCatalogEnabled(ctx.tenantId, ctx.providerId);
    return {
      tenantId: ctx.tenantId,
      providerId: ctx.providerId,
      actorId: ctx.actorId,
      purpose: v.purpose,
      memberId: member.id,
      clientId,
      branchId: branch.id,
      serviceDate: v.serviceDate,
      serviceDateIso: v.serviceDateIso,
      benefitCategory: v.benefitCategory,
      eligible: true, // not evaluated here; submit re-resolves in full
      contractId: terms.id,
      contractVersionId: terms.currentVersionId,
      currency: terms.currency,
      unlistedServiceRule: terms.unlistedServiceRule,
      unlistedDiscountPct: terms.unlistedDiscountPct?.toString() ?? null,
      catalogueEnabled,
    };
  },
} as const;
