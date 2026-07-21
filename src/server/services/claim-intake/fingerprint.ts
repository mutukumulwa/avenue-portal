/**
 * Claims Autopilot — request hash and duplicate fingerprints (F1.3).
 *
 * THREE distinct, versioned hashes — never conflate identity with similarity
 * (D7, §8.2–§8.4):
 *
 *   1. requestHash          — SHA-256 of canonical claim-affecting content.
 *                             Detects "same idempotency key, CHANGED payload"
 *                             (⇒ conflict). Excludes transport-only fields.
 *   2. strongEventFingerprint — set ONLY when an authoritative, scoped business
 *                             identity exists (provider invoice, authenticated
 *                             external ref, case slice+entry-set, or explicit PA
 *                             conversion). Safe to LINK a later receipt to an
 *                             existing claim. `null` when no authoritative
 *                             identity exists.
 *   3. suspectedDuplicateFingerprint — a NON-unique content signature. It can
 *                             only surface CANDIDATES for review; it may never
 *                             auto-link or auto-merge. Content-identical repeat
 *                             services legitimately share it.
 *
 * All three are SHA-256 hex → no readable PII in the stored value. Each is
 * prefixed with a kind + version (`req:v1:`, `strong:v1:`, `suspect:v1:`) so a
 * deliberate versioning change is explicit and old values never silently match
 * new ones.
 *
 * Pure module: Node crypto only, no DB, no clock.
 */
import { createHash } from "node:crypto";
import type { ServiceType, BenefitCategory } from "@prisma/client";
import Decimal from "decimal.js";
import type { NormalizedSubmission } from "./normalize";

/** Bump a value here (and document it) to intentionally rotate a fingerprint. */
export const FINGERPRINT_VERSIONS = { request: "v1", strong: "v1", suspect: "v1" } as const;

// ── Canonical JSON hashing ────────────────────────────────────────────────────

/** Recursively sort object keys; arrays keep order; primitives pass through. */
function canonicalize(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  const obj = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = canonicalize(obj[k]);
  return out;
}

function hashCanonical(v: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(v)), "utf8").digest("hex");
}

function omit<T extends object, K extends keyof T>(o: T, keys: readonly K[]): Omit<T, K> {
  const c = { ...o } as T;
  for (const k of keys) delete (c as Record<string, unknown>)[k as string];
  return c as Omit<T, K>;
}

// ── 1. Request hash ───────────────────────────────────────────────────────────

/**
 * Hash of canonical claim-affecting content. Excludes transport-only fields
 * (`idempotencyKey`, `submittedAt`, `sourceUpdatedAt`) so a genuine replay with
 * the same content hashes identically regardless of when/how it was retried.
 */
export function computeRequestHash(normalized: NormalizedSubmission): string {
  const content = omit(normalized, ["idempotencyKey", "submittedAt", "sourceUpdatedAt"]);
  return `req:${FINGERPRINT_VERSIONS.request}:${hashCanonical(content)}`;
}

// ── 2. Strong event fingerprint ───────────────────────────────────────────────

export interface StrongFingerprintInput {
  tenantId: string;
  /** Provider derived from session/key; required for the invoice precedence. */
  providerId?: string | null;
  /** True when the provider owns its invoice namespace (provider portal/API/CSV/offline). */
  providerOwnsInvoiceNamespace?: boolean;
  invoiceNumber?: string | null;
  /** Authenticated integration identity (non-provider integration). */
  integrationKeyId?: string | null;
  externalClaimRef?: string | null;
  /** Case slice identity. */
  caseId?: string | null;
  caseSliceSeq?: number | null;
  caseFinal?: boolean;
  /** Immutable entry-set identity for a case slice/final (hash of frozen entry ids). */
  entrySetHash?: string | null;
  /** Explicit one-time PA→claim conversion identity. */
  preauthId?: string | null;
  preauthConversionMarker?: string | null;
}

/** Resolve the single authoritative identity by precedence, or null. */
function resolveStrongIdentity(input: StrongFingerprintInput): Record<string, unknown> | null {
  // 1. provider invoice namespace
  if (input.providerOwnsInvoiceNamespace && input.providerId && input.invoiceNumber) {
    return { kind: "invoice", tenantId: input.tenantId, providerId: input.providerId, invoiceNumber: input.invoiceNumber.trim() };
  }
  // 2. authenticated integration external reference
  if (input.integrationKeyId && input.externalClaimRef) {
    return { kind: "external", tenantId: input.tenantId, integrationKeyId: input.integrationKeyId, externalClaimRef: input.externalClaimRef.trim() };
  }
  // 3. case slice + immutable entry-set identity
  if (input.caseId && input.entrySetHash && (input.caseFinal || input.caseSliceSeq != null)) {
    return {
      kind: "case",
      tenantId: input.tenantId,
      caseId: input.caseId,
      slice: input.caseFinal ? "final" : String(input.caseSliceSeq),
      entrySetHash: input.entrySetHash,
    };
  }
  // 4. explicit one-time PA conversion
  if (input.preauthId && input.preauthConversionMarker) {
    return { kind: "preauth", tenantId: input.tenantId, preauthId: input.preauthId, marker: input.preauthConversionMarker };
  }
  return null;
}

/**
 * Authoritative strong event fingerprint, or `null` when no authoritative
 * identity exists. When two receipts across rails resolve to the same non-null
 * value, the later one may safely LINK to the already-authoritative claim.
 */
export function computeStrongEventFingerprint(input: StrongFingerprintInput): string | null {
  const identity = resolveStrongIdentity(input);
  if (!identity) return null;
  return `strong:${FINGERPRINT_VERSIONS.strong}:${hashCanonical(identity)}`;
}

// ── 3. Suspected-duplicate fingerprint + query descriptor ─────────────────────

export interface SuspectFingerprintInput {
  tenantId: string;
  providerId?: string | null;
  branchId?: string | null;
  /** Resolved member identity key (id preferred, else number). */
  memberKey: string;
  normalized: NormalizedSubmission;
}

/**
 * NON-unique content signature. Content-identical repeat services legitimately
 * share it. It surfaces candidates for review; it must NEVER auto-link/merge and
 * must never share the strong fingerprint's uniqueness constraint (§8.4).
 * Line signatures are order-independent (sorted) so a re-ordered resubmission of
 * the same content matches.
 */
export function computeSuspectedDuplicateFingerprint(input: SuspectFingerprintInput): string {
  const n = input.normalized;
  const lineSigs = n.lines
    .map((l) => ({ code: l.cptCode ?? l.drugCode ?? l.icdCode ?? null, qty: l.quantity, amount: l.billedAmount }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const signature = {
    tenantId: input.tenantId,
    providerId: input.providerId ?? null,
    branchId: input.branchId ?? null,
    memberKey: input.memberKey,
    serviceType: n.encounter.serviceType,
    benefitCategory: n.encounter.benefitCategory,
    serviceFrom: n.encounter.serviceFrom,
    serviceTo: n.encounter.serviceTo,
    currency: n.currency,
    total: n.totalBilled,
    lines: lineSigs,
  };
  return `suspect:${FINGERPRINT_VERSIONS.suspect}:${hashCanonical(signature)}`;
}

export interface SuspectedDuplicateDescriptor {
  tenantId: string;
  providerId: string | null;
  memberKey: string;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  serviceFrom: string;
  serviceTo: string | null;
  amountLow: string;
  amountHigh: string;
}

/**
 * Broader candidate-search descriptor (§8.4): provider + member + service-date
 * window + benefit/service type + amount band, for the existing duplicate
 * control to find plausible duplicates a fuzzy visit would fall into.
 * `bandFraction` widens the amount band (0 = exact total).
 */
export function buildSuspectedDuplicateDescriptor(input: SuspectFingerprintInput, bandFraction = 0): SuspectedDuplicateDescriptor {
  const n = input.normalized;
  const total = new Decimal(n.totalBilled);
  const band = total.times(bandFraction);
  return {
    tenantId: input.tenantId,
    providerId: input.providerId ?? null,
    memberKey: input.memberKey,
    serviceType: n.encounter.serviceType,
    benefitCategory: n.encounter.benefitCategory,
    serviceFrom: n.encounter.serviceFrom,
    serviceTo: n.encounter.serviceTo,
    amountLow: total.minus(band).toFixed(),
    amountHigh: total.plus(band).toFixed(),
  };
}
