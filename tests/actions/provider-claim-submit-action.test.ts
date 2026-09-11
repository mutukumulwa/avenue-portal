/**
 * Family Hospital UAT plan P04.01 — the provider "File a claim" action (seam
 * test). Permission first; the case, diagnosis and lines come from the shared
 * preparation step; the intake receives the SERVER's member, branch, benefit,
 * date, currency and line provenance; success redirects with the claim number
 * and nothing identifying the member; a replay that produced no claim is never
 * shown as a filed claim.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const access = vi.hoisted(() => ({
  value: {
    ctx: { actorType: "PROVIDER_USER", actorId: "u1", tenantId: "t1", providerId: "prov-fh", allowedProviderBranchIds: ["br-main"], permissions: ["provider.claim.create"], apiScopes: [] as string[], requestId: "r" },
    session: { user: { id: "u1" } },
    provider: { contractStatus: "ACTIVE" },
  },
}));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: { resolveUserContext: vi.fn(async () => access.value) },
  isProviderAccessError: () => false,
}));

const prep = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/server/services/provider-claim-capture.service", async (orig) => {
  const real = await orig<typeof import("@/server/services/provider-claim-capture.service")>();
  return { ...real, ProviderClaimCaptureService: { ...real.ProviderClaimCaptureService, prepare: prep.prepare } };
});

const intake = vi.hoisted(() => ({ runClaimIntake: vi.fn() }));
vi.mock("@/server/services/claim-intake", () => intake);

const db = vi.hoisted(() => ({ claim: { findFirst: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const nav = vi.hoisted(() => ({ redirect: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: nav.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: nav.revalidatePath }));

import { submitProviderClaimAction } from "@/app/provider/claims/new/actions";
import { mutationFail } from "@/lib/mutation-contract";
import type { ClaimCaptureSubmission } from "@/lib/provider-capture-contract";

const PREPARED = {
  trusted: {
    tenantId: "t1", providerId: "prov-fh", actorId: "u1", purpose: "CLAIM", memberId: "mem-1", clientId: "client-trial", branchId: "br-main",
    serviceDate: new Date("2026-09-11T00:00:00Z"), serviceDateIso: "2026-09-11", benefitCategory: "INPATIENT", eligible: true,
    contractId: "con-fh", contractVersionId: "ver-fh", currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null, catalogueEnabled: true,
  },
  serviceType: "INPATIENT",
  attendingDoctor: "Dr. Sarah Nakiwala",
  diagnosis: { code: "B54", description: "Malaria, unspecified" },
  lines: [{ serviceCategory: "OTHER", description: "Bed Fee – PRIVATE", cptCode: null, quantity: 3, unitCost: "120000", billedAmount: "360000", selectedProviderTariffId: "t-bed", tariffRate: "120000", currency: "UGX", unlisted: false }],
  totalBilled: "360000",
  correlationId: "cor-1",
};

const INPUT: ClaimCaptureSubmission = {
  idempotencyKey: "op_4b0c3a9e-1111-4222-8333-444455556666",
  context: { purpose: "CLAIM", memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-11", benefitCategory: "INPATIENT" },
  expectedContractVersionId: "ver-fh",
  serviceType: "INPATIENT",
  diagnosisCode: "B54",
  lines: [{ selectedProviderTariffId: "t-bed", serviceCategory: "OTHER", quantity: "3", billedUnitPrice: "120000" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  access.value.ctx.permissions = ["provider.claim.create"];
  prep.prepare.mockResolvedValue({ ok: true, prepared: PREPARED });
  db.claim.findFirst.mockResolvedValue(null);
  intake.runClaimIntake.mockResolvedValue({ ok: true, claimId: "c-1", claimNumber: "CLM-2026-00400", receiptId: "rcpt", correlationId: "cor", billedAmount: 360000, outcome: "ACCEPTED", replayed: false, receiptState: "SUCCEEDED" });
});

describe("submitProviderClaimAction", () => {
  it("files through the canonical intake with the server's case, currency and provenance, then redirects", async () => {
    await submitProviderClaimAction(INPUT);
    expect(prep.prepare).toHaveBeenCalledWith(access.value.ctx, INPUT, { purpose: "CLAIM" });
    expect(intake.runClaimIntake).toHaveBeenCalledTimes(1);
    const [caller, data, opts] = intake.runClaimIntake.mock.calls[0];
    expect(caller).toEqual({ kind: "providerUser", tenantId: "t1", userId: "u1", providerId: "prov-fh" });
    expect(data).toEqual({
      memberId: "mem-1",
      providerId: "prov-fh",
      providerBranchId: "br-main",
      serviceType: "INPATIENT",
      benefitCategory: "INPATIENT",
      dateOfService: "2026-09-11",
      attendingDoctor: "Dr. Sarah Nakiwala",
      diagnoses: [{ code: "B54", description: "Malaria, unspecified", standardCharge: null, isPrimary: true }],
      lineItems: [{ serviceCategory: "OTHER", cptCode: "", description: "Bed Fee – PRIVATE", icdCode: "B54", quantity: 3, unitCost: "120000", billedAmount: "360000" }],
      currency: "UGX",
    });
    expect(opts).toEqual({ idempotencyKey: INPUT.idempotencyKey, origin: { lineProvenance: [{ lineNumber: 1, selectedProviderTariffId: "t-bed", tariffRate: "120000" }] } });
    expect(nav.revalidatePath).toHaveBeenCalledWith("/provider/claims");
    expect(nav.redirect).toHaveBeenCalledWith("/provider/claims?submitted=CLM-2026-00400");
    // No member reference of any kind rides in the URL.
    expect(nav.redirect.mock.calls[0][0]).not.toMatch(/mem-1|memberId|member/);
  });

  it("a replay says so", async () => {
    intake.runClaimIntake.mockResolvedValue({ ok: true, claimId: "c-1", claimNumber: "CLM-2026-00400", receiptId: "rcpt", correlationId: "cor", billedAmount: 360000, outcome: "REPLAYED", replayed: true, receiptState: "SUCCEEDED" });
    await submitProviderClaimAction(INPUT);
    expect(nav.redirect).toHaveBeenCalledWith("/provider/claims?submitted=CLM-2026-00400&replayed=1");
  });

  it("refuses without provider.claim.create — before any lookup", async () => {
    access.value.ctx.permissions = ["provider.claim.read"];
    const res = await submitProviderClaimAction(INPUT);
    expect(res).toMatchObject({ ok: false, kind: "FORBIDDEN" });
    expect(prep.prepare).not.toHaveBeenCalled();
    expect(intake.runClaimIntake).not.toHaveBeenCalled();
  });

  it("returns the preparation's refusal unchanged (e.g. an ineligible member)", async () => {
    const failure = mutationFail("VALIDATION", { message: "The claim was not submitted. Correct the items listed.", fieldErrors: { member: ["Not eligible on this date — a claim cannot be filed."] } });
    prep.prepare.mockResolvedValue({ ok: false, failure });
    expect(await submitProviderClaimAction(INPUT)).toBe(failure);
    expect(intake.runClaimIntake).not.toHaveBeenCalled();
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("soft-blocks an identical claim from the last two minutes, comparing the total as a decimal", async () => {
    db.claim.findFirst.mockResolvedValue({ claimNumber: "CLM-2026-00399" });
    const res = await submitProviderClaimAction(INPUT);
    expect(res).toMatchObject({ ok: false, kind: "CONFLICT" });
    expect((res as { message: string }).message).toContain("CLM-2026-00399");
    const where = db.claim.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: "t1", providerId: "prov-fh", memberId: "mem-1", dateOfService: PREPARED.trusted.serviceDate });
    expect(where.billedAmount.toString()).toBe("360000");
    expect(intake.runClaimIntake).not.toHaveBeenCalled();
  });

  it("maps intake errors: an unexpected one is an unknown outcome, a reused key a conflict", async () => {
    intake.runClaimIntake.mockResolvedValueOnce({ ok: false, code: "INTERNAL_ERROR", error: "An unexpected error occurred" });
    expect(await submitProviderClaimAction(INPUT)).toMatchObject({ kind: "UNKNOWN_OUTCOME" });
    intake.runClaimIntake.mockResolvedValueOnce({ ok: false, code: "IDEMPOTENCY_KEY_REUSED", error: "x" });
    expect(await submitProviderClaimAction(INPUT)).toMatchObject({ kind: "CONFLICT" });
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("never presents a claim-less replay as a filed claim", async () => {
    intake.runClaimIntake.mockResolvedValueOnce({ ok: true, claimId: "", claimNumber: null, receiptId: "r", correlationId: "c", billedAmount: 0, outcome: "PROCESSING", replayed: true, receiptState: "FAILED" });
    expect(await submitProviderClaimAction(INPUT)).toMatchObject({ kind: "VALIDATION" });
    intake.runClaimIntake.mockResolvedValueOnce({ ok: true, claimId: "", claimNumber: null, receiptId: "r", correlationId: "c", billedAmount: 0, outcome: "PROCESSING", replayed: true, receiptState: "PROCESSING" });
    expect(await submitProviderClaimAction(INPUT)).toMatchObject({ kind: "UNKNOWN_OUTCOME" });
    expect(nav.redirect).not.toHaveBeenCalled();
  });
});
