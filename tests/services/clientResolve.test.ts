import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  client: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { resolveSchemeClientId } from "@/server/services/clientResolve";

beforeEach(() => vi.clearAllMocks());

describe("resolveSchemeClientId — F-TEN-1 tenant ownership", () => {
  it("returns a caller-supplied clientId ONLY after confirming it belongs to the tenant", async () => {
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c-owned" });
    const id = await resolveSchemeClientId("t1", "c-owned");
    expect(id).toBe("c-owned");
    // The ownership check is tenant-scoped.
    expect(mockPrisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-owned", operatorTenantId: "t1" } }),
    );
  });

  it("REJECTS a forged/foreign clientId (does not attach a scheme to another tenant's client)", async () => {
    // Ownership lookup finds nothing → the id is not this tenant's.
    mockPrisma.client.findFirst.mockResolvedValue(null);
    await expect(resolveSchemeClientId("t1", "c-foreign")).rejects.toThrow(/not found/i);
  });

  it("falls back to the tenant default client when no clientId is supplied", async () => {
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c-default" });
    const id = await resolveSchemeClientId("t1");
    expect(id).toBe("c-default");
    expect(mockPrisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { operatorTenantId: "t1", slug: "default" } }),
    );
  });

  it("throws when the tenant has no default client (seed/backfill never ran)", async () => {
    mockPrisma.client.findFirst.mockResolvedValue(null);
    await expect(resolveSchemeClientId("t1")).rejects.toThrow(/no default client/i);
  });
});
