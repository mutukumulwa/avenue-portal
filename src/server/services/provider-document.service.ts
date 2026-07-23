import type { DocumentTargetType, DocumentSourceType } from "@prisma/client";

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

export type DocumentServiceErrorCode = "INVALID_TARGET_TYPE" | "TARGET_NOT_PROVIDER_UPLOADABLE";

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
} as const;
