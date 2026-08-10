import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * WP-N5 (CON-008) — a LISTED contract may only attach branches that belong to
 * ITS OWN provider. A foreign branch is rejected (no ContractBranch row written),
 * so it can never satisfy the branch-scope validation for another provider.
 */

const mockPrisma = vi.hoisted(() => ({
  providerContract: { findUnique: vi.fn() },
  providerBranch: { findUnique: vi.fn() },
  contractBranch: { upsert: vi.fn(async () => ({})) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "user-1", tenantId: "tenant-1" } }),
  ROLES: { UNDERWRITING: "UNDERWRITING" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    const e = new Error("NEXT_REDIRECT") as Error & { digest?: string };
    e.digest = url;
    throw e;
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const writeAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/audit", () => ({ writeAudit: writeAuditMock }));
vi.mock("@/server/services/service-category.service", () => ({
  ServiceCategoryService: { resolveCategoryId: vi.fn() },
}));

import { attachBranchAction } from "@/app/(admin)/contracts/[id]/manage-actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  return f;
}

const CONTRACT = { id: "c1", contractNumber: "PC-1", status: "DRAFT", providerId: "prov-A", tenantId: "tenant-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.providerContract.findUnique.mockResolvedValue(CONTRACT);
});

describe("attachBranchAction", () => {
  it("rejects a branch that belongs to a DIFFERENT provider (no row written)", async () => {
    mockPrisma.providerBranch.findUnique.mockResolvedValue({ tenantId: "tenant-1", providerId: "prov-B" });
    await expect(attachBranchAction(fd({ contractId: "c1", branchId: "b-foreign" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockPrisma.contractBranch.upsert).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("belong"));
  });

  it("rejects a branch from another tenant", async () => {
    mockPrisma.providerBranch.findUnique.mockResolvedValue({ tenantId: "other-tenant", providerId: "prov-A" });
    await expect(attachBranchAction(fd({ contractId: "c1", branchId: "b-x" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockPrisma.contractBranch.upsert).not.toHaveBeenCalled();
  });

  it("attaches a branch that belongs to the contract's own provider", async () => {
    mockPrisma.providerBranch.findUnique.mockResolvedValue({ tenantId: "tenant-1", providerId: "prov-A" });
    await expect(attachBranchAction(fd({ contractId: "c1", branchId: "b-own" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(mockPrisma.contractBranch.upsert).toHaveBeenCalledOnce();
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "CONTRACT_BRANCH_ATTACHED" }));
    expect(redirectMock).toHaveBeenLastCalledWith("/contracts/c1");
  });
});
