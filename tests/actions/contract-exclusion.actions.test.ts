import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateExclusions, type ExclusionRuleView } from "@/server/services/eligibility/rules/exclusion";

/**
 * WP-N6 (N-012) — a treatment exclusion can be owned by a provider CONTRACT (not
 * just a package version), configured from the contract page. The owner-agnostic
 * action writes a `providerContractId`-owned row; the SAME evaluator the preauth
 * gate uses (preauth-adjudication loads contract-owned rules for the servicing
 * provider's active contract) then excludes on it.
 */

const mockPrisma = vi.hoisted(() => ({
  providerContract: { findFirst: vi.fn() },
  packageVersion: { findUnique: vi.fn() },
  treatmentExclusionRule: { findMany: vi.fn(async (): Promise<unknown[]> => []), create: vi.fn(async (_a?: any) => ({ id: "ex-new" })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "user-1", tenantId: "tenant-1" } }),
  ROLES: { UNDERWRITING: "UNDERWRITING" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const writeAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/audit", () => ({ writeAudit: writeAuditMock }));

import { createTreatmentExclusionAction } from "@/app/(admin)/packages/[id]/edit/actions";

function fd(entries: Record<string, string>, multi: Record<string, string[]> = {}): FormData {
  const f = new FormData();
  Object.entries(entries).forEach(([k, v]) => f.set(k, v));
  Object.entries(multi).forEach(([k, vs]) => vs.forEach((v) => f.append(k, v)));
  return f;
}

const validExclusion = {
  providerContractId: "c1",
  ruleCategory: "EXPERIMENTAL",
  exclusionType: "ABSOLUTE",
  effectiveFrom: "2026-01-01",
  memberSafeExplanation: "This treatment is not covered at this facility.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.providerContract.findFirst.mockResolvedValue({ id: "c1" });
  mockPrisma.treatmentExclusionRule.findMany.mockResolvedValue([]);
});

describe("createTreatmentExclusionAction — contract-owned (N-012)", () => {
  it("creates a rule owned by the provider contract (not a package version)", async () => {
    const r = await createTreatmentExclusionAction(null, fd(validExclusion, { benefitCategories: ["OUTPATIENT"] }));
    expect(r.ok).toBe(true);
    expect(mockPrisma.treatmentExclusionRule.create).toHaveBeenCalledOnce();
    const data = (mockPrisma.treatmentExclusionRule.create.mock.calls[0]![0] as any).data;
    expect(data.providerContractId).toBe("c1");
    expect(data.packageVersionId).toBeUndefined();
    expect(writeAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "TREATMENT_EXCLUSION_CREATE" }));
  });

  it("rejects a contract that is not in the caller's tenant", async () => {
    mockPrisma.providerContract.findFirst.mockResolvedValue(null);
    const r = await createTreatmentExclusionAction(null, fd(validExclusion, { benefitCategories: ["OUTPATIENT"] }));
    expect(r.ok).toBe(false);
    expect(mockPrisma.treatmentExclusionRule.create).not.toHaveBeenCalled();
  });

  it("rejects specifying BOTH a package version and a contract as owner", async () => {
    const r = await createTreatmentExclusionAction(
      null,
      fd({ ...validExclusion, packageVersionId: "pv1" }, { benefitCategories: ["OUTPATIENT"] }),
    );
    expect(r.ok).toBe(false);
    expect(mockPrisma.treatmentExclusionRule.create).not.toHaveBeenCalled();
  });
});

describe("the shared evaluator excludes on a contract-owned rule", () => {
  it("a contract-owned EXPERIMENTAL rule excludes the matching procedure (preauth path)", () => {
    // The projection the preauth gate builds from a contract-owned row.
    const contractRule: ExclusionRuleView = {
      id: "ex-new", ruleCategory: "EXPERIMENTAL", exclusionType: "ABSOLUTE",
      benefitCategories: [], serviceCodes: [], diagnosisCodes: [], procedureCodes: ["0XYZ9"],
      exceptionLogic: null, effectiveFrom: new Date("2026-01-01"), effectiveTo: null,
      memberSafeExplanation: "This treatment is not covered at this facility.", isActive: true,
    };
    const res = evaluateExclusions([contractRule], { serviceDate: new Date("2026-06-15"), procedureCodes: ["0XYZ9"] });
    expect(res.excluded).toBe(true);
    expect(res.reasonCode).toBe("EXPERIMENTAL_EXCLUDED");
  });
});
