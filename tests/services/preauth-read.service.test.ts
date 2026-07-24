/**
 * F3.7 — canonical PA list read model scoping.
 *
 * Proves the layered scope the read model builds: tenant isolation always; client
 * confinement (G2.1) via member.group.clientId only when a clientId is present;
 * provider scoping via providerId; optional status; and the stable include/order.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn(async (_arg?: unknown) => [] as unknown[]));
vi.mock("@/lib/prisma", () => ({ prisma: { preAuthorization: { findMany } } }));

import { PreauthReadService } from "@/server/services/preauth-read.service";

const argOf = () => findMany.mock.calls[0][0] as { where: Record<string, unknown>; orderBy: unknown; include: Record<string, unknown> };

beforeEach(() => vi.clearAllMocks());

describe("F3.7 PreauthReadService.list scoping", () => {
  it("operator (clientId null) → tenant-only, no client/provider narrowing", async () => {
    await PreauthReadService.list({ tenantId: "t1", clientId: null });
    expect(argOf().where).toEqual({ tenantId: "t1" });
  });

  it("operator (clientId omitted) → tenant-only", async () => {
    await PreauthReadService.list({ tenantId: "t1" });
    expect(argOf().where).toEqual({ tenantId: "t1" });
  });

  it("client-confined operator → adds member.group.clientId (G2.1)", async () => {
    await PreauthReadService.list({ tenantId: "t1", clientId: "cl-1" });
    expect(argOf().where).toEqual({ tenantId: "t1", member: { group: { clientId: "cl-1" } } });
  });

  it("provider scope → adds providerId", async () => {
    await PreauthReadService.list({ tenantId: "t1", providerId: "prov-1" });
    expect(argOf().where).toEqual({ tenantId: "t1", providerId: "prov-1" });
  });

  it("status + client + provider compose into one where", async () => {
    await PreauthReadService.list({ tenantId: "t1", clientId: "cl-1", providerId: "prov-1", status: "SUBMITTED" });
    expect(argOf().where).toEqual({ tenantId: "t1", status: "SUBMITTED", providerId: "prov-1", member: { group: { clientId: "cl-1" } } });
  });

  it("orders newest-first and keeps the member + provider projections", async () => {
    await PreauthReadService.list({ tenantId: "t1" });
    const arg = argOf();
    expect(arg.orderBy).toEqual({ createdAt: "desc" });
    expect(arg.include).toHaveProperty("member");
    expect(arg.include).toHaveProperty("provider");
  });
});
