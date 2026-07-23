import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient, DocumentTargetType, DocumentSourceType } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "./provider-access.service";

/**
 * Policy-based upload constraints (§9.9): a SMALL allowed MIME set + a hard size
 * cap + a short intent TTL. Detected-MIME/hash/scan enforcement is F2.4/F2.5.
 */
export const DOCUMENT_UPLOAD_POLICY = {
  allowedMimeTypes: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ] as string[],
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB
  intentTtlMs: 15 * 60 * 1000, // 15 minutes
} as const;

/**
 * PNOS ProviderDocumentService — private, resource-authorized, scanned document
 * handling (D8/D9). Built up across F2:
 *   F2.1 (here) — schema + target-type constraints (this file, minimal);
 *   F2.2 — resource-level authorization per target;
 *   F2.3 — upload-intent creation;
 *   F2.4 — finalize + content validation;
 *   F2.5 — scan/quarantine lifecycle;
 *   F2.6 — authorized short-lived download.
 *
 * Objects stay private; the DB stores a storageKey, never a public URL; every
 * upload and download reauthorizes the caller against the target resource.
 */

/** The document target types a provider workflow may attach evidence to. */
export const PROVIDER_DOCUMENT_TARGET_TYPES: readonly DocumentTargetType[] = [
  "CLAIM", "PREAUTH", "CASE", "INFORMATION_REQUEST", "RECONSIDERATION", "PAYMENT_QUERY", "PROFILE_CHANGE",
] as const;

/** Legacy/admin target types kept readable during migration but not provider-uploadable. */
export const LEGACY_DOCUMENT_TARGET_TYPES: readonly DocumentTargetType[] = [
  "GROUP", "ENDORSEMENT", "QUOTATION", "BROKER", "MEMBER_HEALTH", "OTHER",
] as const;

const ALL_TARGET_TYPES = new Set<DocumentTargetType>([...PROVIDER_DOCUMENT_TARGET_TYPES, ...LEGACY_DOCUMENT_TARGET_TYPES]);

export type DocumentServiceErrorCode =
  | "INVALID_TARGET_TYPE"
  | "TARGET_NOT_PROVIDER_UPLOADABLE"
  | "TARGET_TYPE_NOT_SUPPORTED"
  | "NOT_FOUND"
  | "POLICY_MIME";

export type DocumentAction = "VIEW" | "UPLOAD";

export interface AuthorizedDocumentTarget {
  targetType: DocumentTargetType;
  targetId: string;
  tenantId: string;
  providerId: string;
  providerBranchId: string | null;
  status: string | null;
}

type Db = PrismaClient | Prisma.TransactionClient;

// Per-target required permission (F1.1 catalog). Undefined ⇒ the target type is
// not yet a provider document surface (its loader arrives with its own phase).
const TARGET_PERMISSION: Partial<Record<DocumentTargetType, Record<DocumentAction, string>>> = {
  CLAIM: { VIEW: "provider.claim.read", UPLOAD: "provider.claim.respond" },
  PREAUTH: { VIEW: "provider.preauth.read", UPLOAD: "provider.preauth.respond" },
  CASE: { VIEW: "provider.case.read", UPLOAD: "provider.case.read" },
};

export class ProviderDocumentError extends Error {
  constructor(public code: DocumentServiceErrorCode, message: string) {
    super(message);
    this.name = "ProviderDocumentError";
  }
}

export const ProviderDocumentService = {
  /** A known target type at all. */
  isKnownTargetType(t: string): t is DocumentTargetType {
    return ALL_TARGET_TYPES.has(t as DocumentTargetType);
  },

  /** A target a PROVIDER user/credential may upload evidence to. */
  isProviderUploadableTarget(t: string): boolean {
    return PROVIDER_DOCUMENT_TARGET_TYPES.includes(t as DocumentTargetType);
  },

  /**
   * F2.1 target-type constraint (validated in service code, spec §7.4 step 4):
   * reject an unknown target type, and — for provider-originated uploads —
   * reject a target type providers may not attach to.
   */
  assertProviderUploadTarget(targetType: string, sourceType: DocumentSourceType): void {
    if (!this.isKnownTargetType(targetType)) {
      throw new ProviderDocumentError("INVALID_TARGET_TYPE", `Unknown document target type: ${targetType}`);
    }
    const providerOriginated = sourceType === "PROVIDER_USER" || sourceType === "PROVIDER_API";
    if (providerOriginated && !this.isProviderUploadableTarget(targetType)) {
      throw new ProviderDocumentError("TARGET_NOT_PROVIDER_UPLOADABLE", `Providers may not upload to target type: ${targetType}`);
    }
  },

  /**
   * F2.2 — authorize a document action against a target, in the §9.1 order:
   * action permission → resource load scoped to the caller's tenant+provider
   * (absent OR cross-provider both return a SAFE not-found) → branch check when
   * the target is branch-scoped. Operator/member access is a separate admin
   * path, not this provider-scoped service. Does NOT expose the object (F2.6).
   */
  async authorizeTarget(
    ctx: ProviderAccessContext,
    input: { targetType: DocumentTargetType; targetId: string; action: DocumentAction },
    db: Db = prisma,
  ): Promise<AuthorizedDocumentTarget> {
    const perm = TARGET_PERMISSION[input.targetType]?.[input.action];
    if (!perm) {
      throw new ProviderDocumentError("TARGET_TYPE_NOT_SUPPORTED", `Document target ${input.targetType} not yet supported for provider ${input.action}`);
    }
    // 1. actor permission (about the actor, does not reveal resource existence)
    ProviderAccessService.requirePermission(ctx, perm);

    // 2. load the target scoped to tenant + provider
    let target: { providerBranchId?: string | null; status?: string } | null = null;
    if (input.targetType === "CLAIM") {
      target = await db.claim.findFirst({ where: { id: input.targetId, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { providerBranchId: true, status: true } });
    } else if (input.targetType === "PREAUTH") {
      target = await db.preAuthorization.findFirst({ where: { id: input.targetId, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { status: true } });
    } else if (input.targetType === "CASE") {
      target = await db.clinicalCase.findFirst({ where: { id: input.targetId, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { providerBranchId: true, status: true } });
    }
    // absent OR belonging to another provider → indistinguishable not-found (§9.1)
    if (!target) throw new ProviderDocumentError("NOT_FOUND", "No such document target");

    // 3. branch scope (when the target carries a branch)
    const providerBranchId = (target as { providerBranchId?: string | null }).providerBranchId ?? null;
    if (providerBranchId) ProviderAccessService.requireBranch(ctx, providerBranchId);

    return {
      targetType: input.targetType, targetId: input.targetId, tenantId: ctx.tenantId, providerId: ctx.providerId,
      providerBranchId, status: (target as { status?: string }).status ?? null,
    };
  },

  /**
   * F2.3 — create a short-lived, single-target upload intent. Authorizes the
   * target (UPLOAD), validates the declared MIME policy, mints a single-use
   * token, and audits. Returns NO public-read access — the object is handled at
   * finalize (F2.4). Target + actor binding are fixed at creation and cannot be
   * changed afterwards; finalize re-checks them against the token.
   */
  async createUploadIntent(
    ctx: ProviderAccessContext,
    input: { targetType: DocumentTargetType; targetId: string; expectedMimeTypes?: string[]; maxSizeBytes?: number },
    db: Db = prisma,
  ) {
    const target = await this.authorizeTarget(ctx, { targetType: input.targetType, targetId: input.targetId, action: "UPLOAD" }, db);

    const mimes = input.expectedMimeTypes && input.expectedMimeTypes.length ? input.expectedMimeTypes : DOCUMENT_UPLOAD_POLICY.allowedMimeTypes;
    const disallowed = mimes.filter((m) => !DOCUMENT_UPLOAD_POLICY.allowedMimeTypes.includes(m));
    if (disallowed.length) {
      throw new ProviderDocumentError("POLICY_MIME", `Unsupported file type(s): ${disallowed.join(", ")}`);
    }
    const maxSizeBytes = Math.min(input.maxSizeBytes ?? DOCUMENT_UPLOAD_POLICY.maxSizeBytes, DOCUMENT_UPLOAD_POLICY.maxSizeBytes);
    const sourceType: DocumentSourceType = ctx.actorType === "API_KEY" ? "PROVIDER_API" : "PROVIDER_USER";
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + DOCUMENT_UPLOAD_POLICY.intentTtlMs);

    const intent = await db.documentUploadIntent.create({
      data: {
        tenantId: ctx.tenantId, targetType: input.targetType, targetId: input.targetId,
        expectedProviderId: ctx.providerId, expectedProviderBranchId: target.providerBranchId,
        sourceType, sourceActorId: ctx.actorId, expectedMimeTypes: mimes, maxSizeBytes, token, expiresAt,
      },
      select: { id: true, targetType: true, targetId: true, expectedMimeTypes: true, maxSizeBytes: true, expiresAt: true, sourceActorId: true, expectedProviderId: true, expectedProviderBranchId: true },
    });

    await db.auditLog.create({
      data: { userId: ctx.actorId, tenantId: ctx.tenantId, action: "PROVIDER_DOCUMENT_INTENT_CREATED", module: "PROVIDERS", description: "Upload intent created", entityType: "DOCUMENT_UPLOAD_INTENT", entityId: intent.id, metadata: { targetType: input.targetType, targetId: input.targetId, providerId: ctx.providerId } },
    });

    // token is returned to the caller once; NO public-read URL is issued.
    return { intentId: intent.id, token, expiresAt: intent.expiresAt, maxSizeBytes: intent.maxSizeBytes, expectedMimeTypes: intent.expectedMimeTypes, targetType: intent.targetType, targetId: intent.targetId };
  },

  /**
   * Resolve an OPEN intent by token — only if it exists, is unexpired, and is
   * not already finalized. Returns null otherwise (expired/used/unknown all look
   * the same). Used by finalize (F2.4).
   */
  async resolveOpenIntent(token: string, now: Date = new Date(), db: Db = prisma) {
    const intent = await db.documentUploadIntent.findUnique({ where: { token } });
    if (!intent) return null;
    if (intent.finalizedAt) return null;
    if (intent.expiresAt.getTime() <= now.getTime()) return null;
    return intent;
  },
} as const;
