import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * WP-N5 (N-005/006) — activation governance is authoritative in the service:
 *  - an unsigned contract (V2) may be activated ONLY with an APPROVED activation
 *    override on THIS contract — never with a bare `allowUnsigned` flag;
 *  - backdating past the horizon needs an APPROVED CONTRACT_BACKDATE override,
 *    resolved from the DB — a client-supplied `backdateOverrideId` is ignored, so
 *    a forged id (e.g. through the tRPC door) cannot bypass governance.
 */

const prisma = vi.hoisted(() => ({
  providerContract: { findUnique: vi.fn() },
  overrideRecord: { findFirst: vi.fn(async (_args?: any): Promise<unknown> => null) },
  $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(txMock)),
}));
vi.mock("@/lib/prisma", () => ({ prisma }));

const auditAppend = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: { append: auditAppend } }));

const txMock = {
  providerContract: { updateMany: vi.fn(async () => ({})), update: vi.fn(async () => ({ id: "c1", status: "ACTIVE" })) },
  contractVersion: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: "v1", status: "ACTIVE" })) },
  providerTariff: { updateMany: vi.fn(async () => ({})) },
};

import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";
import { ProviderContractsService } from "@/server/services/provider-contracts.service";

const DAY = 24 * 60 * 60 * 1000;
const recent = new Date(Date.now() - 5 * DAY);
const future = new Date(Date.now() + 200 * DAY);
const wayBack = new Date(Date.now() - 200 * DAY); // beyond the 90-day horizon

function contract(over: Record<string, unknown> = {}) {
  return {
    id: "c1", tenantId: "tenant-1", status: "APPROVED", contractNumber: "PC-1", providerId: "p1",
    startDate: recent, endDate: future, createdById: "creator", submittedById: "submitter",
    approvedById: "approver", approvedAt: new Date(), currentVersionId: null,
    title: "T", contractType: "RATE_SCHEDULE", reviewDueDate: null, currency: "UGX",
    paymentTermDays: 30, paymentTermType: "CALENDAR", unlistedServiceRule: "REFER_FOR_REVIEW",
    balanceBillingPolicy: "PROHIBITED", submissionWindowDays: 30, submissionWindowBasis: "SERVICE_DATE",
    taxInclusive: "UNKNOWN", reconciliationCadence: "NONE", branchScope: "ALL_BRANCHES", executionStatus: "UNSIGNED",
    ...over,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  prisma.overrideRecord.findFirst.mockResolvedValue(null);
  vi.spyOn(ProviderContractsService, "syncProviderSummary").mockResolvedValue(undefined as never);
});

describe("activate — unsigned (V2) waiver requires an approved override (N-005)", () => {
  it("blocks unsigned activation with a bare allowUnsigned flag and no override", async () => {
    prisma.providerContract.findUnique.mockResolvedValue(contract());
    vi.spyOn(ContractLifecycleService, "validate").mockResolvedValue({
      ok: false,
      issues: [{ rule: "V2", severity: "ERROR", message: "unsigned" }],
    });
    await expect(
      ContractLifecycleService.activate("tenant-1", "c1", "user-1", { allowUnsigned: true }),
    ).rejects.toThrow(/unsigned/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("also blocks when allowUnsigned is NOT set (V2 stays a hard error)", async () => {
    prisma.providerContract.findUnique.mockResolvedValue(contract());
    vi.spyOn(ContractLifecycleService, "validate").mockResolvedValue({
      ok: false,
      issues: [{ rule: "V2", severity: "ERROR", message: "unsigned" }],
    });
    await expect(
      ContractLifecycleService.activate("tenant-1", "c1", "user-1", {}),
    ).rejects.toThrow(/validation/i);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows unsigned activation when an APPROVED activation (CUSTOM) override exists", async () => {
    prisma.providerContract.findUnique.mockResolvedValue(contract());
    vi.spyOn(ContractLifecycleService, "validate").mockResolvedValue({
      ok: false,
      issues: [{ rule: "V2", severity: "ERROR", message: "unsigned" }],
    });
    prisma.overrideRecord.findFirst.mockImplementation(async ({ where }: { where: { overrideType: string } }) =>
      where.overrideType === "CUSTOM" ? { id: "ov-unsigned" } : null,
    );
    const res = await ContractLifecycleService.activate("tenant-1", "c1", "user-1", { allowUnsigned: true });
    expect(res.status).toBe("ACTIVE");
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});

describe("activate — backdating past the horizon (N-006)", () => {
  it("ignores a forged backdateOverrideId and blocks when no APPROVED override exists", async () => {
    prisma.providerContract.findUnique.mockResolvedValue(contract({ executionStatus: "FULLY_EXECUTED", startDate: wayBack }));
    vi.spyOn(ContractLifecycleService, "validate").mockResolvedValue({ ok: true, issues: [] });
    // No override rows in the DB — a client-supplied id must not help.
    prisma.overrideRecord.findFirst.mockResolvedValue(null);
    await expect(
      ContractLifecycleService.activate("tenant-1", "c1", "user-1", { backdateOverrideId: "forged-id" } as never),
    ).rejects.toThrow(/CONTRACT_BACKDATE/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("activates a within-horizon FULLY_EXECUTED contract without any override", async () => {
    prisma.providerContract.findUnique.mockResolvedValue(contract({ executionStatus: "FULLY_EXECUTED", startDate: recent }));
    vi.spyOn(ContractLifecycleService, "validate").mockResolvedValue({ ok: true, issues: [] });
    const res = await ContractLifecycleService.activate("tenant-1", "c1", "user-1", {});
    expect(res.status).toBe("ACTIVE");
  });
});
