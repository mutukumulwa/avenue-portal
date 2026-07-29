/**
 * F3.5c — the tRPC PA `create` mutation converged on the canonical intake+pipeline.
 *
 * src/server/trpc/routers/preauth.ts::create no longer calls
 * ClaimsService.createPreAuth. It submits through PreauthIntakeService on channel
 * ADMIN_TRPC (the SAME path the B2B/member/admin-UI rails use) with the post-commit
 * auto-decision wired to preauthAdjudicationService.executeAutoDecision, then returns
 * the created PA via the canonical read. A rejection maps to a TRPCError BAD_REQUEST.
 *
 * Seam/contract test (caller + mock deps; mirrors tests/services/trpc-claims-router).
 * Intake→receipt→event→handoff mechanics have real-DB proof in
 * tests/services/preauth-intake-service.test.ts (F3.3).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cap = vi.hoisted(() => ({
  submitArgs: null as null | { ctx: Record<string, unknown>; submission: Record<string, unknown>; deps: { adjudicate: (paId: string, tid: string) => Promise<void> } },
  submitResult: null as unknown,
}));
const claimsServiceMock = vi.hoisted(() => ({
  createPreAuth: vi.fn(),
  getPreAuthById: vi.fn(async () => ({ id: "pa-1", status: "SUBMITTED" })),
  getPreAuthorizations: vi.fn(),
  createClaimWithPreauth: vi.fn(),
}));
const adj = vi.hoisted(() => ({ executeAutoDecision: vi.fn(async () => undefined), approveByHuman: vi.fn(async () => undefined), declineByHuman: vi.fn(async () => undefined) }));

vi.mock("@/server/services/claims.service", () => ({ ClaimsService: claimsServiceMock }));
vi.mock("@/server/services/preauth-adjudication.service", () => ({ preauthAdjudicationService: adj }));
vi.mock("@/server/services/system-actor.service", () => ({ getSystemActorId: vi.fn(async () => "sys-actor") }));
vi.mock("@/server/services/preauth-intake/service", () => ({
  PreauthIntakeService: {
    submit: vi.fn(async (ctx: Record<string, unknown>, submission: Record<string, unknown>, deps: { adjudicate: (paId: string, tid: string) => Promise<void> }) => {
      cap.submitArgs = { ctx, submission, deps };
      return cap.submitResult;
    }),
  },
}));
const readList = vi.hoisted(() => vi.fn(async () => ["pa-list"] as unknown[]));
const readGetById = vi.hoisted(() => vi.fn(async () => ({ id: "pa-1", status: "SUBMITTED" }) as unknown));
vi.mock("@/server/services/preauth-read.service", () => ({ PreauthReadService: { list: readList, getById: readGetById } }));

import { preauthRouter } from "@/server/trpc/routers/preauth";
import { createCallerFactory } from "@/server/trpc/trpc";
import { PreauthIntakeService } from "@/server/services/preauth-intake/service";

const caller = () => createCallerFactory(preauthRouter)({ session: { user: { id: "u1", role: "ADMIN" } }, tenantId: "t1" } as never);
const callerAs = (clientId?: string) => createCallerFactory(preauthRouter)({ session: { user: { id: "u1", role: "ADMIN" } }, tenantId: "t1", clientId } as never);

const input = {
  memberId: "member-1",
  providerId: "prov-1",
  serviceType: "OUTPATIENT" as const,
  diagnoses: [{ icdCode: "B54", description: "Malaria", isPrimary: true }],
  procedures: [{ cptCode: "99213", description: "Consult", quantity: 1, unitCost: 8000, total: 8000 }],
  estimatedCost: 8000,
  clinicalNotes: "notes",
  benefitCategory: "OUTPATIENT" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  cap.submitArgs = null;
  cap.submitResult = { receiptId: "r1", status: "ACCEPTED", replayed: false, preauthId: "pa-1" };
  readGetById.mockResolvedValue({ id: "pa-1", status: "SUBMITTED" });
});

describe("F3.5c tRPC PA create → canonical pipeline", () => {
  it("submits through the canonical intake with ADMIN_TRPC context + mapped command, and returns the created PA", async () => {
    const res = await caller().create(input);
    expect(PreauthIntakeService.submit).toHaveBeenCalledTimes(1);
    const { ctx, submission } = cap.submitArgs!;
    expect(ctx).toEqual({ channel: "ADMIN_TRPC", tenantId: "t1", providerId: "prov-1", actorType: "USER", actorId: "u1" });
    expect(submission).toMatchObject({ memberId: "member-1", providerId: "prov-1", serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", estimatedCost: 8000 });
    expect((submission.diagnoses as Array<Record<string, unknown>>)[0]).toMatchObject({ icdCode: "B54", description: "Malaria" });
    expect((submission.procedures as Array<Record<string, unknown>>)[0]).toMatchObject({ cptCode: "99213", unitCost: 8000, total: 8000 });
    expect(res).toEqual({ id: "pa-1", status: "SUBMITTED" });
    // F3.10: read back via the canonical read model, unscoped (return what was just created)
    expect(readGetById).toHaveBeenCalledWith({ tenantId: "t1" }, "pa-1");
  });

  it("no longer calls ClaimsService.createPreAuth", async () => {
    await caller().create(input);
    expect(claimsServiceMock.createPreAuth).not.toHaveBeenCalled();
  });

  it("wires the auto-decision to the canonical pipeline (executeAutoDecision) with a system actor", async () => {
    await caller().create(input);
    await cap.submitArgs!.deps.adjudicate("pa-1", "t1");
    expect(adj.executeAutoDecision).toHaveBeenCalledWith("pa-1", "t1", "sys-actor");
    expect(adj.approveByHuman).not.toHaveBeenCalled();
  });

  it("maps a REJECTED submission to a TRPCError BAD_REQUEST and does not read the PA back", async () => {
    cap.submitResult = { receiptId: "r2", status: "REJECTED", replayed: false, errors: [{ code: "MISSING_DIAGNOSES", message: "At least one diagnosis is required" }] };
    const err = (await caller().create(input).catch((e: unknown) => e)) as { code?: string; message?: string };
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("At least one diagnosis is required");
    expect(readGetById).not.toHaveBeenCalled();
  });

  it("the router source has no path into ClaimsService.createPreAuth (structural)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "server", "trpc", "routers", "preauth.ts"), "utf8");
    expect(src).not.toMatch(/createPreAuth\s*\(/);
  });
});

describe("F3.7 tRPC PA list → canonical read model (client confinement)", () => {
  it("passes the confined clientId to the canonical read model", async () => {
    const res = await callerAs("cl-1").list();
    expect(readList).toHaveBeenCalledWith({ tenantId: "t1", clientId: "cl-1" });
    expect(res).toEqual(["pa-list"]);
  });

  it("an operator session (no clientId) passes null (all clients in tenant)", async () => {
    await callerAs(undefined).list();
    expect(readList).toHaveBeenCalledWith({ tenantId: "t1", clientId: null });
  });
});

describe("F3.10 tRPC PA getById → canonical detail read (client confinement)", () => {
  it("passes the confined clientId to the read model and returns the PA", async () => {
    const res = await callerAs("cl-1").getById({ id: "pa-1" });
    expect(readGetById).toHaveBeenCalledWith({ tenantId: "t1", clientId: "cl-1" }, "pa-1");
    expect(res).toEqual({ id: "pa-1", status: "SUBMITTED" });
  });

  it("an operator (no clientId) passes null", async () => {
    await callerAs(undefined).getById({ id: "pa-1" });
    expect(readGetById).toHaveBeenCalledWith({ tenantId: "t1", clientId: null }, "pa-1");
  });

  it("a non-enumerating null (out of scope) → NOT_FOUND", async () => {
    readGetById.mockResolvedValueOnce(null);
    const err = (await callerAs("cl-1").getById({ id: "pa-x" }).catch((e: unknown) => e)) as { code?: string };
    expect(err.code).toBe("NOT_FOUND");
  });
});
