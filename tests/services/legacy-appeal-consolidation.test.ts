/**
 * PNOS F5.17 — legacy appeal consolidation.
 *
 * (1) Architecture guard: no source file writes a claim to a legacy appeal status
 *     (APPEALED / APPEAL_APPROVED / APPEAL_DECLINED) — the old same-claim mutation path is retired,
 *     so a new route/action that revives it turns the build red. (2) The safe mapping to a
 *     reconsideration case is defined + preserves the record's facts. (3) The legacy statuses are
 *     NOT deleted (historic views/reports keep working).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ClaimStatus } from "@prisma/client";
import {
  mapLegacyAppealToReconsideration,
  isLegacyAppealStatus,
  LEGACY_APPEAL_TO_RECONSIDERATION,
  LEGACY_APPEAL_STATUSES,
  type LegacyAppealClaim,
} from "@/server/services/claim-reconsideration/legacy-appeal";

const SRC_ROOT = join(__dirname, "..", "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
const relPath = (full: string) => relative(join(__dirname, "..", ".."), full).split(sep).join("/");

/** A write of a legacy appeal status into a data block, ignoring comment lines. */
const APPEAL_STATUS_WRITE = /status\s*:\s*["'](APPEALED|APPEAL_APPROVED|APPEAL_DECLINED)["']/;
const isComment = (line: string) => {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
};

describe("F5.17 legacy appeal — architecture guard", () => {
  const files = walk(SRC_ROOT);

  it("scans the source tree (guard is actually running)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("no source file writes a claim to a legacy appeal status (old mutation path retired)", () => {
    const offenders: string[] = [];
    for (const full of files) {
      const lines = readFileSync(full, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!isComment(line) && APPEAL_STATUS_WRITE.test(line)) offenders.push(`${relPath(full)}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      offenders.length
        ? `A claim-status write to a legacy appeal state was found. Same-claim appeals are retired — file a reconsideration (F5.11–F5.16) instead:\n${offenders.join("\n")}`
        : "",
    ).toEqual([]);
  });

  it("no source still calls the retired initiateAppeal to create an appeal", () => {
    // The method survives (throwing) for signature stability, but nothing should INVOKE it.
    const callers = files
      .filter((f) => !f.endsWith("claim-adjudication.service.ts"))
      .filter((f) => /\.initiateAppeal\s*\(/.test(readFileSync(f, "utf8")));
    expect(callers.map(relPath)).toEqual([]);
  });
});

describe("F5.17 legacy appeal — safe mapping to reconsideration", () => {
  const base: LegacyAppealClaim = {
    id: "c1", status: "APPEALED", currency: "UGX", providerId: "p1", providerBranchId: "b1",
    chainRootClaimId: null, adjudicatorId: "adj1", appealNotes: "The exclusion does not apply.",
    appealReviewerId: "rev1", appealDate: new Date("2026-03-01T00:00:00Z"),
  };

  it("maps each legacy status to the right reconsideration state", () => {
    expect(LEGACY_APPEAL_TO_RECONSIDERATION).toEqual({ APPEALED: "UNDER_REVIEW", APPEAL_APPROVED: "ACCEPTED", APPEAL_DECLINED: "UPHELD" });
    expect(mapLegacyAppealToReconsideration({ ...base, status: "APPEALED" })!.status).toBe("UNDER_REVIEW");
    expect(mapLegacyAppealToReconsideration({ ...base, status: "APPEAL_APPROVED" })!.status).toBe("ACCEPTED");
    expect(mapLegacyAppealToReconsideration({ ...base, status: "APPEAL_DECLINED" })!.status).toBe("UPHELD");
  });

  it("preserves the record's facts and never invents identity", () => {
    const m = mapLegacyAppealToReconsideration(base)!;
    expect(m.claimId).toBe("c1");
    expect(m.chainRootClaimId).toBe("c1"); // null chain root ⇒ the claim is its own root
    expect(m.providerId).toBe("p1");
    expect(m.providerBranchId).toBe("b1");
    expect(m.currency).toBe("UGX");
    expect(m.originalAdjudicatorId).toBe("adj1");
    expect(m.providerNarrative).toBe("The exclusion does not apply.");
    expect(m.filedAt).toEqual(new Date("2026-03-01T00:00:00Z"));
    expect(m.reasonCode).toBe("LEGACY_APPEAL");
  });

  it("flags migratable ONLY with unambiguous facts (notes + a distinct reviewer)", () => {
    expect(mapLegacyAppealToReconsideration(base)!.migratable).toBe(true);
    expect(mapLegacyAppealToReconsideration({ ...base, appealNotes: null })!.migratable).toBe(false); // no notes
    expect(mapLegacyAppealToReconsideration({ ...base, appealNotes: "  " })!.migratable).toBe(false); // blank notes
    expect(mapLegacyAppealToReconsideration({ ...base, appealReviewerId: null })!.migratable).toBe(false); // no reviewer
    expect(mapLegacyAppealToReconsideration({ ...base, appealReviewerId: "adj1" })!.migratable).toBe(false); // reviewer == adjudicator
  });

  it("returns null for a non-appeal status (only legacy appeals map)", () => {
    expect(mapLegacyAppealToReconsideration({ ...base, status: "DECLINED" })).toBeNull();
    expect(mapLegacyAppealToReconsideration({ ...base, status: "PAID" })).toBeNull();
    expect(isLegacyAppealStatus("DECLINED")).toBe(false);
    expect(LEGACY_APPEAL_STATUSES.every(isLegacyAppealStatus)).toBe(true);
  });
});

describe("F5.17 legacy appeal — historic preservation (no deletion of statuses)", () => {
  it("keeps the legacy ClaimStatus enum values for historic records/reports", () => {
    expect(ClaimStatus.APPEALED).toBe("APPEALED");
    expect(ClaimStatus.APPEAL_APPROVED).toBe("APPEAL_APPROVED");
    expect(ClaimStatus.APPEAL_DECLINED).toBe("APPEAL_DECLINED");
  });
});
