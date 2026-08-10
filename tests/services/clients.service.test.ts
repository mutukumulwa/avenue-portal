import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  client: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  group: { count: vi.fn() },
  member: { count: vi.fn() },
  invoice: { count: vi.fn() },
  claim: { count: vi.fn() },
  adminFeeLedgerEntry: { count: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { ClientsService } from "@/server/services/clients.service";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.client.create.mockResolvedValue({ id: "c-new" });
  mockPrisma.client.update.mockResolvedValue({ id: "c1" });
});

describe("ClientsService.create", () => {
  it("stores nameNormalized + derived slug + canonical prefix (DEF-013/014/015)", async () => {
    await ClientsService.create("t1", {
      name: "Lakeview Ltd",
      type: "INSURER",
      currency: "UGX",
      memberNumberPrefix: "lmu",
    });
    const data = mockPrisma.client.create.mock.calls[0][0].data;
    expect(data.nameNormalized).toBe("lakeview ltd");
    expect(data.slug).toBe("lakeview-ltd");
    expect(data.memberNumberPrefix).toBe("LMU"); // courtesy-uppercased
    expect(data.currency).toBe("UGX");
    expect(data.status).toBe("ACTIVE");
  });

  it("sets nameNormalized even when an explicit distinct slug is supplied (name dedup no longer bypassable via slug)", async () => {
    await ClientsService.create("t1", {
      name: "Lakeview",
      type: "INSURER",
      currency: "UGX",
      slug: "totally-different-code",
    });
    const data = mockPrisma.client.create.mock.calls[0][0].data;
    expect(data.slug).toBe("totally-different-code");
    // The normalized-name key is written regardless of the slug, so the
    // @@unique([operatorTenantId, nameNormalized]) still catches the duplicate.
    expect(data.nameNormalized).toBe("lakeview");
  });

  it("defaults an omitted prefix to MVX", async () => {
    await ClientsService.create("t1", { name: "Acme", type: "HMO", currency: "KES" });
    expect(mockPrisma.client.create.mock.calls[0][0].data.memberNumberPrefix).toBe("MVX");
  });

  it("rejects an explicit invalid prefix (service-door defence)", async () => {
    await expect(
      ClientsService.create("t1", { name: "Acme", type: "HMO", currency: "UGX", memberNumberPrefix: "l m" }),
    ).rejects.toThrow(/prefix/i);
    expect(mockPrisma.client.create).not.toHaveBeenCalled();
  });

  it("rejects a parent that is not in the operator tenant", async () => {
    mockPrisma.client.findFirst.mockResolvedValue(null);
    await expect(
      ClientsService.create("t1", { name: "Sub", type: "INSURER", currency: "UGX", parentClientId: "foreign" }),
    ).rejects.toThrow(/parent/i);
    expect(mockPrisma.client.create).not.toHaveBeenCalled();
  });
});

describe("ClientsService.update", () => {
  beforeEach(() => mockPrisma.client.findFirst.mockResolvedValue({ id: "c1" }));

  it("recomputes nameNormalized on rename and never writes slug/prefix", async () => {
    await ClientsService.update("t1", "c1", { name: "  New   Name " });
    const data = mockPrisma.client.update.mock.calls[0][0].data;
    expect(data.nameNormalized).toBe("new name");
    expect("slug" in data).toBe(false);
    expect("memberNumberPrefix" in data).toBe(false);
  });

  it("clears effectiveTo on reactivation (ACTIVE)", async () => {
    await ClientsService.update("t1", "c1", { status: "ACTIVE" });
    const data = mockPrisma.client.update.mock.calls[0][0].data;
    expect(data.status).toBe("ACTIVE");
    expect(data.isActive).toBe(true);
    expect(data.effectiveTo).toBeNull();
  });

  it("sets effectiveTo on deactivation", async () => {
    await ClientsService.update("t1", "c1", { status: "SUSPENDED" });
    const data = mockPrisma.client.update.mock.calls[0][0].data;
    expect(data.isActive).toBe(false);
    expect(data.effectiveTo).toBeInstanceOf(Date);
  });

  it("throws when the client is not in the operator tenant", async () => {
    mockPrisma.client.findFirst.mockResolvedValue(null);
    await expect(ClientsService.update("t1", "nope", { name: "X" })).rejects.toThrow(/not found/i);
    expect(mockPrisma.client.update).not.toHaveBeenCalled();
  });
});

describe("ClientsService.hasFinancialActivity (D8)", () => {
  const zero = () => {
    mockPrisma.group.count.mockResolvedValue(0);
    mockPrisma.member.count.mockResolvedValue(0);
    mockPrisma.invoice.count.mockResolvedValue(0);
    mockPrisma.claim.count.mockResolvedValue(0);
    mockPrisma.adminFeeLedgerEntry.count.mockResolvedValue(0);
  };

  it("returns false for a client with no activity", async () => {
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1" });
    zero();
    expect(await ClientsService.hasFinancialActivity("t1", "c1")).toBe(false);
  });

  it("returns true once a scheme (Group) exists (C-005)", async () => {
    mockPrisma.client.findFirst.mockResolvedValue({ id: "c1" });
    zero();
    mockPrisma.group.count.mockResolvedValue(1);
    expect(await ClientsService.hasFinancialActivity("t1", "c1")).toBe(true);
  });

  it("returns false for a client not owned by the tenant (never mislabels foreign as inactive-and-editable)", async () => {
    mockPrisma.client.findFirst.mockResolvedValue(null);
    expect(await ClientsService.hasFinancialActivity("t1", "foreign")).toBe(false);
    expect(mockPrisma.group.count).not.toHaveBeenCalled();
  });
});
