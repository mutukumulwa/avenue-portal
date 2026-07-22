/**
 * Claims Autopilot F2.4 — policy mode validation + fail-closed resolution.
 */
import { describe, it, expect } from "vitest";
import {
  validateLivePolicy,
  effectivePolicyMode,
  canExecuteLive,
  classifyHistoricalPolicyMode,
  type PolicyLike,
} from "@/server/services/claim-autopilot/policy";
import { Prisma, AutoAdjudicationMode, AutoAdjudicationPolicyStatus, ClaimSource, ServiceType, BenefitCategory } from "@prisma/client";

const validLive = (over: Partial<PolicyLike> = {}): PolicyLike => ({
  mode: "LIVE",
  status: "APPROVED",
  maxAutoApproveAmount: 50000,
  requireAllLinesPriced: true,
  requireDocumentsComplete: true,
  requireEligibilityClear: true,
  requireCleanFraud: true,
  requirePreauthWhenNeeded: true,
  allowedSources: ["MANUAL"],
  allowedServiceTypes: ["OUTPATIENT"],
  allowedBenefitCategories: ["OUTPATIENT"],
  ...over,
});

describe("F2.4 — validateLivePolicy", () => {
  it("accepts a fully-specified approved LIVE policy", () => {
    expect(validateLivePolicy(validLive())).toEqual({ valid: true, issues: [] });
  });

  it.each([
    ["status not APPROVED", { status: "PENDING_APPROVAL" }, /APPROVED/],
    ["no ceiling", { maxAutoApproveAmount: null }, /finite ceiling/],
    ["zero ceiling", { maxAutoApproveAmount: 0 }, /positive/],
    ["negative ceiling", { maxAutoApproveAmount: -1 }, /positive/],
    ["a required gate disabled", { requireCleanFraud: false }, /requireCleanFraud/],
    ["prices gate disabled", { requireAllLinesPriced: false }, /requireAllLinesPriced/],
    ["no allowed sources", { allowedSources: [] }, /allowedSources/],
    ["no allowed service types", { allowedServiceTypes: [] }, /allowedServiceTypes/],
    ["no allowed benefits", { allowedBenefitCategories: [] }, /allowedBenefitCategories/],
  ])("rejects when %s", (_label, over, re) => {
    const r = validateLivePolicy(validLive(over as Partial<PolicyLike>));
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => re.test(i))).toBe(true);
  });

  it("accepts a Prisma.Decimal ceiling", () => {
    expect(validateLivePolicy(validLive({ maxAutoApproveAmount: new Prisma.Decimal("100000.50") })).valid).toBe(true);
  });
});

describe("F2.4 — effectivePolicyMode is fail-closed", () => {
  it("valid LIVE ⇒ LIVE", () => {
    expect(effectivePolicyMode(validLive())).toBe("LIVE");
    expect(canExecuteLive(validLive())).toBe(true);
  });

  it("a row claiming LIVE but invalid ⇒ OFF (never executes)", () => {
    expect(effectivePolicyMode(validLive({ status: "DRAFT" }))).toBe("OFF");
    expect(effectivePolicyMode(validLive({ maxAutoApproveAmount: null }))).toBe("OFF");
    expect(canExecuteLive(validLive({ maxAutoApproveAmount: null }))).toBe(false);
  });

  it("SHADOW honoured only when APPROVED", () => {
    expect(effectivePolicyMode(validLive({ mode: "SHADOW", status: "APPROVED" }))).toBe("SHADOW");
    expect(effectivePolicyMode(validLive({ mode: "SHADOW", status: "DRAFT" }))).toBe("OFF");
  });

  it("OFF ⇒ OFF", () => {
    expect(effectivePolicyMode(validLive({ mode: "OFF" }))).toBe("OFF");
  });
});

describe("F2.4 — classifyHistoricalPolicyMode never infers LIVE", () => {
  it("defaults to OFF", () => {
    expect(classifyHistoricalPolicyMode({ enabled: true })).toBe("OFF");
    expect(classifyHistoricalPolicyMode({ enabled: false })).toBe("OFF");
  });
  it("maps a previously-enabled policy to SHADOW only when opted in", () => {
    expect(classifyHistoricalPolicyMode({ enabled: true }, { enabledToShadow: true })).toBe("SHADOW");
    expect(classifyHistoricalPolicyMode({ enabled: false }, { enabledToShadow: true })).toBe("OFF");
  });
});

describe("F2.4 — schema fields exist (compile-time)", () => {
  it("AutoAdjudicationPolicy accepts the governed fields + enums", () => {
    const create: Prisma.AutoAdjudicationPolicyUncheckedCreateInput = {
      tenantId: "t1",
      mode: AutoAdjudicationMode.OFF,
      status: AutoAdjudicationPolicyStatus.DRAFT,
      allowAutoPartial: false,
      allowedSources: [ClaimSource.MANUAL],
      allowedServiceTypes: [ServiceType.OUTPATIENT],
      allowedBenefitCategories: [BenefitCategory.OUTPATIENT],
      version: 1,
    };
    expect(create.mode).toBe("OFF");
    expect(create.status).toBe("DRAFT");
  });
});
