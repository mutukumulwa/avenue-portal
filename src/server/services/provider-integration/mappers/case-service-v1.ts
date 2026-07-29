import { createHash } from "node:crypto";
import type { ClaimLineCategory } from "@prisma/client";

/**
 * PNOS F9.5 — external → canonical mapping for the CASE_SERVICE object type,
 * version CASE_SERVICE.v1. This is the versioned mapper the durable-delivery
 * processor uses to turn one HMS batch record into a canonical CaseService command.
 * It mirrors the legacy hms-batch envelope (so the same facilities keep working)
 * but is pure, versioned, and fixture-testable. It NEVER touches the database.
 */

export const CASE_SERVICE_MAPPING_VERSION = "CASE_SERVICE.v1";

const CATEGORIES = new Set(["CONSULTATION", "LABORATORY", "PHARMACY", "IMAGING", "PROCEDURE", "OTHER"]);

/** One external record as an HMS pushes it (the legacy HmsBatchEntry shape). */
export interface CaseServiceRecordV1 {
  caseNumber?: string;
  memberNumber?: string;
  entryDate: string;
  category?: string;
  serviceCode?: string;
  description: string;
  quantity?: number;
  unitAmount: number;
}

export interface CaseServiceBatchV1 {
  mappingVersion?: string; // optional; when present must equal CASE_SERVICE.v1
  entries: CaseServiceRecordV1[];
}

/** The canonical CaseService.addServiceEntry input (minus tenant/case, resolved by the processor). */
export interface CanonicalCaseServiceInput {
  entryDate: Date;
  category: ClaimLineCategory;
  serviceCode: string | null;
  description: string;
  quantity: number;
  unitAmount: number;
}

export interface MappedCaseServiceRecord {
  match: { caseNumber?: string; memberNumber?: string };
  canonical: CanonicalCaseServiceInput;
  amount: number; // quantity * unitAmount — the record's contribution to control totals
}

export class CaseServiceMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaseServiceMappingError";
  }
}

/** Validate the batch envelope + version and return its records. Throws on a structural problem. */
export function parseCaseServiceBatchV1(parsed: unknown): CaseServiceRecordV1[] {
  const b = parsed as Partial<CaseServiceBatchV1> | null;
  if (!b || typeof b !== "object") throw new CaseServiceMappingError("batch must be a JSON object");
  if (b.mappingVersion && b.mappingVersion !== CASE_SERVICE_MAPPING_VERSION) {
    throw new CaseServiceMappingError(`Unsupported mappingVersion — expected ${CASE_SERVICE_MAPPING_VERSION}`);
  }
  if (!Array.isArray(b.entries) || b.entries.length === 0) {
    throw new CaseServiceMappingError("entries[] is required");
  }
  return b.entries;
}

/**
 * Deterministic per-record identity — the record's idempotency key within a
 * delivery (mirrors the legacy lineHash so a record that already applied under the
 * legacy path is recognizably the same shape).
 */
export function recordHashV1(e: CaseServiceRecordV1): string {
  return createHash("sha256")
    .update([e.caseNumber ?? "", e.memberNumber ?? "", e.entryDate, e.serviceCode ?? "", e.description, e.quantity ?? 1, e.unitAmount].join("|"))
    .digest("hex")
    .slice(0, 32);
}

/**
 * Map + validate ONE external record into the canonical command, or return a SAFE
 * error reason for a structurally-bad record (a REJECTED per-record outcome — never
 * a thrown poison that aborts the batch).
 */
export function mapCaseServiceRecordV1(e: CaseServiceRecordV1): MappedCaseServiceRecord | { error: string } {
  if (!e || typeof e !== "object") return { error: "record is not an object" };
  if (!e.description) return { error: "description is required" };
  if (!e.entryDate || Number.isNaN(Date.parse(e.entryDate))) return { error: "valid entryDate is required" };
  if (typeof e.unitAmount !== "number" || Number.isNaN(e.unitAmount) || e.unitAmount < 0) return { error: "unitAmount must be a non-negative number" };
  if (e.quantity !== undefined && (!Number.isInteger(e.quantity) || e.quantity < 1)) return { error: "quantity must be a positive whole number" };
  if (!e.caseNumber && !e.memberNumber) return { error: "caseNumber or memberNumber is required" };

  const quantity = e.quantity ?? 1;
  const category = (CATEGORIES.has(e.category ?? "") ? e.category : "OTHER") as ClaimLineCategory;
  return {
    match: { caseNumber: e.caseNumber, memberNumber: e.memberNumber },
    canonical: {
      entryDate: new Date(e.entryDate),
      category,
      serviceCode: e.serviceCode ?? null,
      description: e.description,
      quantity,
      unitAmount: e.unitAmount,
    },
    amount: quantity * e.unitAmount,
  };
}
