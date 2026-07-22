/**
 * F5.3 — tRPC claims router: legacy `create` mutation REMOVED (explicit-removal
 * guard), adjudicate stays on the canonical decision stack (D10), and
 * list/getById enforce client confinement (G2.1).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prismaMock = vi.hoisted(() => ({ claim: { findFirst: vi.fn() } }));
const claimsServiceMock = vi.hoisted(() => ({
  getClaims: vi.fn(async () => ["list-result"]),
  getClaimById: vi.fn(async () => ({ id: "c1" })),
}));
const decideMock = vi.hoisted(() => vi.fn(async () => ({ decided: true })));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/server/services/claims.service", () => ({ ClaimsService: claimsServiceMock }));
vi.mock("@/server/services/claim-decision.service", () => ({ ClaimDecisionService: { decide: decideMock } }));

import { claimsRouter } from "@/server/trpc/routers/claims";
import { createCallerFactory } from "@/server/trpc/trpc";

const caller = (clientId?: string) =>
  createCallerFactory(claimsRouter)({
    session: { user: { id: "u1", role: "CLAIMS_OFFICER" } },
    tenantId: "t1",
    clientId,
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.claim.findFirst.mockResolvedValue({ id: "c1" });
});

describe("F5.3 — legacy create mutation removed", () => {
  it("the router exposes NO create procedure (explicit removal, not adaptation)", () => {
    const procedures = Object.keys((claimsRouter as unknown as { _def: { procedures: Record<string, unknown> } })._def.procedures);
    expect(procedures.sort()).toEqual(["adjudicate", "getById", "list"]);
  });

  it("the router source has no path into ClaimsService.createClaim", () => {
    const src = readFileSync(join(__dirname, "..", "..", "src", "server", "trpc", "routers", "claims.ts"), "utf8");
    expect(src).not.toMatch(/createClaim\s*\(/);
    expect(src).not.toMatch(/\bcreate:\s*protectedProcedure/);
  });
});

describe("F5.3 — client confinement on reads (G2.1)", () => {
  it("list passes the confined clientId through to the service", async () => {
    await caller("cl-1").list();
    expect(claimsServiceMock.getClaims).toHaveBeenCalledWith("t1", undefined, "cl-1");
  });

  it("list for an operator (no confinement) passes null scope", async () => {
    await caller(undefined).list();
    expect(claimsServiceMock.getClaims).toHaveBeenCalledWith("t1", undefined, null);
  });

  it("getById refuses a confined user's out-of-scope claim with NOT_FOUND", async () => {
    prismaMock.claim.findFirst.mockResolvedValue(null); // not in the caller's client
    await expect(caller("cl-1").getById({ id: "c-other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(claimsServiceMock.getClaimById).not.toHaveBeenCalled();
  });

  it("getById returns an in-scope claim for a confined user", async () => {
    const res = await caller("cl-1").getById({ id: "c1" });
    expect(res).toEqual({ id: "c1" });
    expect(prismaMock.claim.findFirst).toHaveBeenCalledWith({
      where: { id: "c1", tenantId: "t1", member: { group: { clientId: "cl-1" } } },
      select: { id: true },
    });
  });
});

describe("F5.3 — adjudication stays canonical (D10)", () => {
  it("adjudicate routes through ClaimDecisionService.decide", async () => {
    await caller().adjudicate({ claimId: "c1", action: "APPROVED", approvedAmount: 100 });
    expect(decideMock).toHaveBeenCalledWith("t1", "c1", expect.objectContaining({ action: "APPROVED", approvedAmount: 100, reviewerId: "u1" }));
  });
});
