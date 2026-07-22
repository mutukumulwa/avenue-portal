/**
 * Claims Autopilot — derived intake context (F3.1).
 *
 * THE security boundary. Given an already-authenticated caller identity and a
 * structurally-valid submission, it derives the trusted tenant / provider /
 * client / member / scope / channel / source. Nothing security-relevant is ever
 * taken from the request body (§7.2, D12):
 *   - `tenantId` comes from the caller, never the body.
 *   - provider rails DERIVE `providerId` from the credential/session; a
 *     body-supplied provider that differs is REJECTED.
 *   - operator rails may SELECT a provider from the body, but only after it is
 *     validated inside the caller's tenant.
 *   - members are resolved scoped to the tenant and (for provider rails) to the
 *     provider's entitlement; an ambiguous member number fails safe.
 *
 * Read-only resolution (runs before the intake transaction); returns a frozen
 * typed context and never mutates its inputs.
 */
import { prisma } from "@/lib/prisma";
import type { ClaimIntakeChannel, ClaimSource, Prisma } from "@prisma/client";
import { IntakeError } from "./errors";
import { ProviderEntitlementService } from "../provider-entitlement.service";
import { ProvidersService } from "../providers.service";
import { ClaimsService } from "../claims.service";
import { isFutureServiceDate, FUTURE_SERVICE_DATE_ERROR } from "@/lib/service-date";
import type { ClaimSubmissionV1 } from "./schema";

/** The authenticated, server-derived caller. Routes/actions build this. */
export type CallerIdentity =
  | { kind: "operatorUser"; tenantId: string; userId: string } // ADMIN_PORTAL
  | { kind: "providerUser"; tenantId: string; userId: string; providerId: string } // PROVIDER_PORTAL
  | { kind: "providerKey"; tenantId: string; providerId: string; keyId: string; sourceHint?: ClaimSource } // API_V1 (provider)
  | { kind: "integrationKey"; tenantId: string; keyId: string; sourceHint?: ClaimSource } // API_V1 (operator/integration)
  | { kind: "csvOperator"; tenantId: string; userId: string } // CSV_IMPORT
  | { kind: "offlineDevice"; tenantId: string; providerId: string; deviceId: string } // OFFLINE_SYNC
  | { kind: "reimbursement"; tenantId: string; userId: string } // REIMBURSEMENT
  | { kind: "preauthConversion"; tenantId: string; preauthId: string; providerId: string; systemActorId: string } // PREAUTH_CONVERSION
  | { kind: "caseSystem"; tenantId: string; caseId: string; isFinal: boolean; providerId: string; systemActorId: string; sourceHint?: ClaimSource }; // CASE_*

export interface IntakeContext {
  readonly tenantId: string;
  readonly channel: ClaimIntakeChannel;
  readonly source: ClaimSource;
  readonly scopeKey: string;
  readonly actorId: string;
  readonly isSystemActor: boolean;
  readonly providerId: string;
  readonly providerBranchId: string | null;
  readonly clientId: string | null;
  readonly memberId: string;
  readonly currency: string;
  readonly providerOwnsInvoiceNamespace: boolean;
  readonly integrationKeyId: string | null;
}

interface ChannelMeta {
  channel: ClaimIntakeChannel;
  source: ClaimSource;
  providerOwnsInvoiceNamespace: boolean;
  isSystemActor: boolean;
  /** true ⇒ providerId is derived from the caller (body value must match); false ⇒ selected from body within tenant. */
  providerDerived: boolean;
  /**
   * true ⇒ resolve the member scoped to the provider's contract entitlement
   * (programmatic facility rails). false ⇒ resolve within the tenant only.
   * Decoupled from `providerDerived` (F5.1): the provider PORTAL derives its
   * provider (D12) but must NOT entitlement-scope members — that would block a
   * facility whose `ContractApplicability` is not yet configured, a regression
   * from the portal's tenant-wide member lookup. Case/preauth rails carry a
   * member fixed by their source entity, so scoping is moot for them.
   */
  scopeMembersByEntitlement: boolean;
}

function channelMeta(caller: CallerIdentity): ChannelMeta {
  switch (caller.kind) {
    case "operatorUser":
      return { channel: "ADMIN_PORTAL", source: "MANUAL", providerOwnsInvoiceNamespace: true, isSystemActor: false, providerDerived: false, scopeMembersByEntitlement: false };
    case "providerUser":
      return { channel: "PROVIDER_PORTAL", source: "MANUAL", providerOwnsInvoiceNamespace: true, isSystemActor: false, providerDerived: true, scopeMembersByEntitlement: false };
    case "providerKey":
      // A provider facility system; default HMS unless the key declares SMART/Slade.
      return { channel: "API_V1", source: caller.sourceHint ?? "HMS", providerOwnsInvoiceNamespace: true, isSystemActor: false, providerDerived: true, scopeMembersByEntitlement: true };
    case "integrationKey":
      // Non-provider integration: authenticated external ref (not provider invoice) is authoritative.
      return { channel: "API_V1", source: caller.sourceHint ?? "SMART", providerOwnsInvoiceNamespace: false, isSystemActor: true, providerDerived: false, scopeMembersByEntitlement: false };
    case "csvOperator":
      return { channel: "CSV_IMPORT", source: "BATCH", providerOwnsInvoiceNamespace: true, isSystemActor: false, providerDerived: false, scopeMembersByEntitlement: false };
    case "offlineDevice":
      return { channel: "OFFLINE_SYNC", source: "OFFLINE_SYNC", providerOwnsInvoiceNamespace: true, isSystemActor: true, providerDerived: true, scopeMembersByEntitlement: true };
    case "reimbursement":
      return { channel: "REIMBURSEMENT", source: "REIMBURSEMENT", providerOwnsInvoiceNamespace: false, isSystemActor: false, providerDerived: false, scopeMembersByEntitlement: false };
    case "preauthConversion":
      return { channel: "PREAUTH_CONVERSION", source: "PREAUTH", providerOwnsInvoiceNamespace: false, isSystemActor: true, providerDerived: true, scopeMembersByEntitlement: false };
    case "caseSystem":
      return { channel: caller.isFinal ? "CASE_FINAL" : "CASE_INTERIM", source: caller.sourceHint ?? "HMS", providerOwnsInvoiceNamespace: false, isSystemActor: true, providerDerived: true, scopeMembersByEntitlement: false };
  }
}

function callerProviderId(caller: CallerIdentity): string | null {
  return "providerId" in caller ? caller.providerId : null;
}

/**
 * The audit-attribution actor. `AuditLog.userId` is a REQUIRED FK to `User`, so
 * key/device rails (which have no human user) resolve the tenant's system actor
 * — exactly how the legacy B2B route attributed API submissions. The caller's
 * own identity is still fully recorded via `scopeKey`/`channel` on the receipt.
 */
async function resolveActorId(caller: CallerIdentity): Promise<string> {
  if ("userId" in caller) return caller.userId;
  if ("systemActorId" in caller) return caller.systemActorId;
  const { getSystemActorId } = await import("../system-actor.service");
  return getSystemActorId(caller.tenantId);
}

function integrationKeyId(caller: CallerIdentity): string | null {
  return caller.kind === "integrationKey" ? caller.keyId : null;
}

/** Resolve and validate the provider for this submission. */
async function resolveProvider(caller: CallerIdentity, meta: ChannelMeta, submission: ClaimSubmissionV1): Promise<string> {
  const derived = callerProviderId(caller);
  const supplied = submission.provider.providerId ?? null;

  let providerId: string;
  if (meta.providerDerived) {
    // Provider rails: the credential/session wins; a differing body value is rejected (D12).
    if (!derived) throw IntakeError.authorization("Provider could not be derived from the caller.");
    if (supplied && supplied !== derived) {
      throw IntakeError.authorization("Submitted provider does not match the authenticated provider.", { supplied });
    }
    providerId = derived;
  } else {
    // Operator/integration rails: a provider must be selected in the body, validated within tenant.
    if (!supplied) throw IntakeError.validation([{ path: "provider.providerId", code: "REQUIRED", message: "a provider is required for this channel", severity: "ERROR" }]);
    providerId = supplied;
  }

  const provider = await prisma.provider.findFirst({
    where: { id: providerId, tenantId: caller.tenantId },
    select: { id: true, contractStatus: true, name: true },
  });
  if (!provider) throw IntakeError.authorization("Provider is not in this tenant's scope.");
  if (!ProvidersService.isOperational(provider.contractStatus)) {
    throw IntakeError.authorization(`Provider "${provider.name}" is ${provider.contractStatus} — claims cannot be submitted against it.`);
  }
  return providerId;
}

/** Validate an optional branch belongs to the provider and is active. */
async function resolveBranch(tenantId: string, providerId: string, branchId: string | undefined): Promise<string | null> {
  if (!branchId) return null;
  const branch = await prisma.providerBranch.findFirst({
    where: { id: branchId, tenantId, providerId },
    select: { id: true, isActive: true },
  });
  if (!branch) throw IntakeError.validation([{ path: "provider.branchId", code: "INVALID", message: "branch does not belong to the provider", severity: "ERROR" }]);
  if (!branch.isActive) throw IntakeError.validation([{ path: "provider.branchId", code: "INACTIVE", message: "branch is deactivated", severity: "ERROR" }]);
  return branchId;
}

/**
 * Resolve the member scoped to the tenant and (for provider rails) to the
 * provider's entitlement. Non-enumerating: a foreign/absent member and an
 * ambiguous member number both fail without revealing existence.
 */
async function resolveMember(
  tenantId: string,
  providerScoped: Prisma.MemberWhereInput | null,
  member: ClaimSubmissionV1["member"],
): Promise<{ memberId: string; clientId: string | null }> {
  const idClause: Prisma.MemberWhereInput | null = member.memberId
    ? { id: member.memberId }
    : member.memberNumber
      ? { memberNumber: member.memberNumber }
      : null;
  if (!idClause) {
    throw IntakeError.validation([{ path: "member", code: "REQUIRED", message: "member id or member number is required", severity: "ERROR" }]);
  }
  const where: Prisma.MemberWhereInput = {
    tenantId,
    ...idClause,
    ...(providerScoped ? { AND: [providerScoped] } : {}),
  };

  const matches = await prisma.member.findMany({
    where,
    select: { id: true, group: { select: { clientId: true } } },
    take: 2,
  });
  if (matches.length === 0) throw IntakeError.authorization("Member is not accessible to this caller.");
  if (matches.length > 1) throw IntakeError.validation([{ path: "member", code: "AMBIGUOUS", message: "member reference matched more than one member; use the member id", severity: "ERROR" }]);
  return { memberId: matches[0].id, clientId: matches[0].group?.clientId ?? null };
}

function buildScopeKey(caller: CallerIdentity, memberId: string): string {
  switch (caller.kind) {
    case "operatorUser":
    case "csvOperator":
      return `user:${caller.userId}`;
    case "providerUser":
    case "providerKey":
      return `provider:${caller.providerId}`;
    case "integrationKey":
      return `integration:${caller.keyId}`;
    case "offlineDevice":
      return `device:${caller.providerId}:${caller.deviceId}`;
    case "reimbursement":
      return `reimbursement:${memberId}`;
    case "preauthConversion":
      return `preauth:${caller.preauthId}`;
    case "caseSystem":
      return `case:${caller.caseId}`;
  }
}

/**
 * Resolve the full, trusted intake context. Throws a safe `IntakeError` on any
 * scope/authorization failure.
 */
export async function resolveIntakeContext(caller: CallerIdentity, submission: ClaimSubmissionV1): Promise<IntakeContext> {
  // Structural gate that needs a clock (§7: the schema/normalization defer it here,
  // F3.1). A captured service cannot fall on a future operating-timezone day —
  // this is an impossible request (D6), rejected at the door for every rail, not a
  // routed business outcome.
  if (isFutureServiceDate(new Date(submission.encounter.serviceFrom))) {
    throw IntakeError.validation(
      [{ path: "encounter.serviceFrom", code: "FUTURE_DATE", message: FUTURE_SERVICE_DATE_ERROR, severity: "ERROR" }],
      FUTURE_SERVICE_DATE_ERROR,
    );
  }

  const meta = channelMeta(caller);
  const providerId = await resolveProvider(caller, meta, submission);
  const providerBranchId = await resolveBranch(caller.tenantId, providerId, submission.provider.branchId);

  const providerScoped = meta.scopeMembersByEntitlement ? await ProviderEntitlementService.entitledMemberWhere(providerId) : null;
  const { memberId, clientId } = await resolveMember(caller.tenantId, providerScoped, submission.member);

  const currency = submission.currency ?? (await ClaimsService.resolveClaimCurrency(caller.tenantId, providerId, memberId));

  return Object.freeze({
    tenantId: caller.tenantId,
    channel: meta.channel,
    source: meta.source,
    scopeKey: buildScopeKey(caller, memberId),
    actorId: await resolveActorId(caller),
    isSystemActor: meta.isSystemActor,
    providerId,
    providerBranchId,
    clientId,
    memberId,
    currency,
    providerOwnsInvoiceNamespace: meta.providerOwnsInvoiceNamespace,
    integrationKeyId: integrationKeyId(caller),
  });
}
