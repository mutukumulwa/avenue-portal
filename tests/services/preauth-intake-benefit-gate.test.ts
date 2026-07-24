/**
 * F3.6 CATCH — the canonical intake enforces the benefit-in-package precondition
 * (PR-024) for EVERY rail.
 *
 * When the member rails were converged (F3.5b/c), the admin + tRPC rails lost the
 * create-time throw that ClaimsService.createPreAuth used to raise for a benefit
 * NOT in the member's package. The auto-decision pipeline's BENEFIT_CAP gate does
 * NOT backstop this — BenefitUsageService.availableLimit returns null for a missing
 * config and the gate simply passes, so a phantom-benefit PA could auto-approve
 * into an unpayable GOP + a stranded hold. PreauthIntakeService now rejects it at
 * intake (no PA created), restoring the guard uniformly.
 *
 * Executable now (mock `db`, no real DB): exercises the REAL gate + REAL
 * BenefitUsageService.resolveConfig against a controllable benefitConfig lookup.
 * The equivalent real-DB regression lives in tests/services/preauth-intake-service.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PreauthCallerContext, PreauthSubmissionV1 } from "@/server/services/preauth-intake/contract";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { PreauthIntakeService } from "@/server/services/preauth-intake/service";

const state = vi.hoisted(() => ({ config: null as null | { id: string; annualSubLimit: number } }));
const paCreate = vi.hoisted(() => vi.fn(async () => ({ id: "pa-x" })));
const txSpy = vi.hoisted(() => vi.fn(async () => { throw new Error("REACHED_TX"); }));

function mockDb() {
  return {
    preauthIntakeReceipt: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "r1" })),
    },
    // resolveMember (ADMIN_PORTAL → tenant-only, no entitlement scope)
    member: {
      findFirst: vi.fn(async () => ({ id: "m1", status: "ACTIVE", groupId: "g1", group: { clientId: "c1" } })),
      // resolveConfig reads packageVersionId + enrollmentDate off the member
      findUnique: vi.fn(async () => ({ packageVersionId: "pv1", enrollmentDate: new Date("2025-01-01") })),
    },
    provider: { findFirst: vi.fn(async () => ({ contractStatus: "ACTIVE" })) },
    // the benefit-config lookup resolveConfig makes — null ⇒ benefit not in package
    benefitConfig: { findFirst: vi.fn(async () => state.config) },
    preAuthorization: { create: paCreate },
    $transaction: txSpy,
  };
}

const ctx: PreauthCallerContext = { channel: "ADMIN_PORTAL", tenantId: "t1", providerId: "prov-1", actorType: "USER", actorId: "admin-1" };
const submission: PreauthSubmissionV1 = {
  memberId: "m1",
  providerId: "prov-1",
  serviceType: "OUTPATIENT",
  benefitCategory: "DENTAL",
  diagnoses: [{ description: "Toothache" }],
  estimatedCost: 5000,
  idempotencyKey: "k1",
};
const deps = { adjudicate: vi.fn(async () => undefined) };
const call = (db: ReturnType<typeof mockDb>) => PreauthIntakeService.submit(ctx, submission, deps, db as never);

beforeEach(() => {
  vi.clearAllMocks();
  state.config = null;
});

describe("F3.6 CATCH — intake benefit-in-package gate (PR-024)", () => {
  it("rejects a PA for a benefit NOT in the member's package — no PA, no transaction", async () => {
    const db = mockDb();
    const res = await call(db);
    expect(res.status).toBe("REJECTED");
    expect(res.errors?.[0].code).toBe("BENEFIT_NOT_IN_PACKAGE");
    expect(res.preauthId).toBeUndefined();
    expect(paCreate).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
    // the REJECTED receipt records the structural failure code
    expect(db.preauthIntakeReceipt.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED", failureCode: "BENEFIT_NOT_IN_PACKAGE" }) }));
  });

  it("passes the gate when the benefit IS in the package (proceeds into the create transaction)", async () => {
    state.config = { id: "bc1", annualSubLimit: 500_000 };
    const db = mockDb();
    // gate passes → reaches db.$transaction (our spy throws a sentinel to prove we got there)
    await expect(call(db)).rejects.toThrow("REACHED_TX");
    expect(txSpy).toHaveBeenCalledTimes(1);
  });
});
