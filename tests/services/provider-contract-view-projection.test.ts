/**
 * F7.2 — provider contract-view projection (pure; no DB).
 *
 * Enforces the F7.1 CONTRACT_VISIBILITY_FIELD_POLICY at the projection boundary:
 * only allow-listed fields are carried, and an internal field cannot leak even
 * when it is present on the input row (the projection is an explicit copy, so an
 * added schema field defaults to hidden). Also pins the effective-label logic and
 * the rateMissing → "under confirmation" safe transform.
 */
import { describe, it, expect } from "vitest";
import {
  CONTRACT_VIEW_STATUSES,
  effectiveLabel,
  projectCapitationRule,
  projectContractHeader,
  projectDocRule,
  projectExclusion,
  projectPreauthRule,
  projectServedScope,
  projectTariff,
  projectVersion,
} from "@/server/services/provider-contract-view/projection";

const now = new Date("2026-07-28T12:00:00.000Z");
const past = new Date("2026-01-01T00:00:00.000Z");
const future = new Date("2026-12-31T00:00:00.000Z");

describe("F7.2 effectiveLabel", () => {
  it("ACTIVE within window ⇒ CURRENT", () => {
    expect(effectiveLabel("ACTIVE", past, future, now)).toBe("CURRENT");
  });
  it("ACTIVE with a future start ⇒ FUTURE", () => {
    expect(effectiveLabel("ACTIVE", future, null, now)).toBe("FUTURE");
  });
  it("ACTIVE past its end ⇒ EXPIRED", () => {
    expect(effectiveLabel("ACTIVE", past, past, now)).toBe("EXPIRED");
  });
  it("terminal statuses are always EXPIRED regardless of window", () => {
    for (const s of ["EXPIRED", "TERMINATED", "SUPERSEDED"]) {
      expect(effectiveLabel(s, past, future, now)).toBe("EXPIRED");
    }
  });
  it("open-ended ACTIVE (no end) ⇒ CURRENT", () => {
    expect(effectiveLabel("ACTIVE", past, null, now)).toBe("CURRENT");
  });
});

describe("F7.2 CONTRACT_VIEW_STATUSES", () => {
  it("is exactly the in-force + historical set (no negotiation states)", () => {
    expect([...CONTRACT_VIEW_STATUSES]).toEqual(["ACTIVE", "EXPIRED", "TERMINATED", "SUPERSEDED"]);
    for (const hidden of ["DRAFT", "UNDER_REVIEW", "PENDING_CLARIFICATION", "APPROVED", "SUSPENDED", "ARCHIVED", "VOIDED"]) {
      expect(CONTRACT_VIEW_STATUSES as readonly string[]).not.toContain(hidden);
    }
  });
});

describe("F7.2 projectContractHeader", () => {
  // A row that also carries EVERY internal field — none may appear in the view.
  const row = {
    id: "c1", contractNumber: "PC-1", title: "MSA", contractType: "RATE_SCHEDULE", status: "ACTIVE",
    branchScope: "ALL_BRANCHES", externalContractRef: "CN-1",
    startDate: past, endDate: future, signedDate: past, autoRenew: true,
    currency: "UGX", country: "UG", region: "Central",
    paymentTermDays: 30, paymentTermType: "CALENDAR",
    submissionWindowDays: 7, submissionWindowBasis: "SERVICE_DATE",
    balanceBillingPolicy: "PROHIBITED", taxInclusive: "INCLUSIVE", reconciliationCadence: "MONTHLY",
    unlistedServiceRule: "DISCOUNT_OFF_BILLED", unlistedDiscountPct: "10.00",
    earlySettlementDiscountPct: "2.00", earlySettlementWindowDays: 30, invoiceDiscountPct: "1.50",
    // ── internal — MUST NOT leak ──
    creditLimit: "5000000", notes: "INTERNAL negotiation note", documentUrl: "https://x/scan.pdf",
    signatories: [{ name: "X" }], executionStatus: "FULLY_EXECUTED", reviewDueDate: past,
    currentVersionId: "v9", supersededById: "c2", contractOwnerId: "u1", createdById: "u1",
    submittedById: "u2", approvedById: "u3", activatedById: "u4",
  } as unknown as Parameters<typeof projectContractHeader>[0];

  const view = projectContractHeader(row, now);
  const flat = JSON.stringify(view);

  it("carries the VISIBLE fields + computed effectiveLabel", () => {
    expect(view.contractNumber).toBe("PC-1");
    expect(view.effectiveLabel).toBe("CURRENT");
    expect(view.paymentTermType).toBe("CALENDAR");
    expect(view.reconciliationCadence).toBe("MONTHLY");
  });
  it("carries the CONDITIONAL commercial terms in their own bucket", () => {
    expect(view.conditional.unlistedServiceRule).toBe("DISCOUNT_OFF_BILLED");
    expect(view.conditional.unlistedDiscountPct).toBe("10.00");
    expect(view.conditional.earlySettlementDiscountPct).toBe("2.00");
    expect(view.conditional.invoiceDiscountPct).toBe("1.50");
  });
  it("NEVER leaks an internal field — not creditLimit, notes, documentUrl, signatories, ownership, version pointers", () => {
    for (const k of ["creditLimit", "notes", "documentUrl", "signatories", "executionStatus", "reviewDueDate", "currentVersionId", "supersededById", "contractOwnerId", "createdById", "submittedById", "approvedById", "activatedById"]) {
      expect(Object.keys(view)).not.toContain(k);
      expect(Object.keys(view.conditional)).not.toContain(k);
      expect(flat).not.toContain(k); // not nested anywhere either
    }
    expect(flat).not.toContain("negotiation note");
    expect(flat).not.toContain("scan.pdf");
  });
});

describe("F7.2 projectTariff", () => {
  const base = {
    id: "t1", serviceName: "Consultation", standardDescription: "General Consultation", providerDescription: "OPD consult",
    cptCode: "99213", providerServiceCode: "SER001", codingSystem: "CPT",
    agreedRate: "1500.00", currency: "UGX", rateType: "FIXED", tariffType: "NEGOTIATED",
    discountPct: null, markupPct: null, maxPayableAmount: null, minPayableAmount: null,
    unitOfMeasure: "PER_ITEM", maxQuantityPerVisit: 1, quantityLimit: null, frequencyLimit: null, frequencyPeriod: null,
    genderRestriction: null, ageMin: null, ageMax: null, requiresPreauth: false, requiresReferral: false,
    externalScheme: "SHA", externalRebateAmount: "300.00",
    rateMissing: false, effectiveFrom: past, effectiveTo: null,
    // ── internal — MUST NOT leak ──
    sourceRef: { documentId: "d1", page: 3, rawText: "raw scan text", confidence: 0.42 },
    notes: "INTERNAL tariff note", versionId: "v1", clientId: "cl1", branchId: "b1", serviceCategoryId: "sc1",
  } as unknown as Parameters<typeof projectTariff>[0];

  it("uses the standard description as the display service name", () => {
    expect(projectTariff(base).service).toBe("General Consultation");
  });
  it("a priced line carries its rate; the external rebate is exposed", () => {
    const v = projectTariff(base);
    expect(v.rate).toBe("1500.00");
    expect(v.rateUnderConfirmation).toBe(false);
    expect(v.externalRebate).toBe("300.00");
  });
  it("rateMissing ⇒ rate is null and rateUnderConfirmation is true (never the extraction detail)", () => {
    const v = projectTariff({ ...base, rateMissing: true });
    expect(v.rate).toBeNull();
    expect(v.rateUnderConfirmation).toBe(true);
  });
  it("NEVER leaks sourceRef/notes/versionId/clientId/branchId/serviceCategoryId or the raw scan text", () => {
    const v = projectTariff(base);
    const flat = JSON.stringify(v);
    for (const k of ["sourceRef", "notes", "versionId", "clientId", "branchId", "serviceCategoryId", "confidence", "rawText"]) {
      expect(Object.keys(v)).not.toContain(k);
      expect(flat).not.toContain(k);
    }
    expect(flat).not.toContain("raw scan text");
    expect(flat).not.toContain("tariff note");
  });
});

describe("F7.2 projectServedScope", () => {
  const rows = [
    { clientId: "cl1", groupId: null, packageId: null, benefitCategory: null, memberCategory: null, networkTier: null, inclusionType: "INCLUDE", effectiveFrom: past, effectiveTo: null, isActive: true },
    { clientId: "cl1", groupId: "g2", packageId: null, benefitCategory: null, memberCategory: null, networkTier: null, inclusionType: "EXCLUDE", effectiveFrom: past, effectiveTo: null, isActive: true },
    { clientId: "cl1", groupId: "g3", packageId: null, benefitCategory: null, memberCategory: null, networkTier: null, inclusionType: "INCLUDE", effectiveFrom: past, effectiveTo: null, isActive: false },
  ];
  it("keeps only ACTIVE INCLUDE rows (EXCLUDE machinery + inactive rows are internal)", () => {
    const scope = projectServedScope(rows);
    expect(scope).toHaveLength(1);
    expect(scope[0].clientId).toBe("cl1");
    expect(scope[0].groupId).toBeNull();
  });
});

describe("F7.2 projectVersion", () => {
  const row = {
    versionNumber: 2, status: "ACTIVE", effectiveFrom: past, effectiveTo: null, changeSummary: "Repriced labs",
    snapshot: { secret: 1 }, validationReport: { v: 1 }, approvedById: "u3", createdById: "u1",
  } as unknown as Parameters<typeof projectVersion>[0];
  it("carries number/window/label/changeSummary, never snapshot/validationReport/approver ids", () => {
    const v = projectVersion(row, now);
    expect(v.versionNumber).toBe(2);
    expect(v.label).toBe("CURRENT");
    expect(v.changeSummary).toBe("Repriced labs");
    const flat = JSON.stringify(v);
    for (const k of ["snapshot", "validationReport", "approvedById", "createdById", "secret"]) {
      expect(flat).not.toContain(k);
    }
  });
  it("a SUPERSEDED version labels EXPIRED", () => {
    expect(projectVersion({ ...row, status: "SUPERSEDED" } as never, now).label).toBe("EXPIRED");
  });
});

describe("F7.2 projectPreauthRule / projectDocRule / projectExclusion", () => {
  it("preauth rule carries the operative fields", () => {
    const r = projectPreauthRule({ triggerType: "AMOUNT_THRESHOLD", thresholdAmount: "50000", admissionRequired: true, emergencyExempt: true, retrospectiveAllowed: false, retrospectiveWindowHours: null, approvalSlaHours: 72, validityDays: 30, requiredDocumentTypes: ["PREAUTH_APPROVAL"], consequenceIfMissing: "REJECT" } as never);
    expect(r.thresholdAmount).toBe("50000");
    expect(r.approvalSlaHours).toBe(72);
    expect(r.requiredDocumentTypes).toEqual(["PREAUTH_APPROVAL"]);
  });
  it("doc rule normalises appliesWhen to null when absent", () => {
    expect(projectDocRule({ documentType: "INVOICE", mandatory: true, appliesWhen: null, consequenceIfMissing: "REJECT" } as never).appliesWhen).toBeNull();
  });
  it("exclusion never leaks its sourceRef", () => {
    const v = projectExclusion({ cptCode: "70551", serviceName: "MRI Brain", reason: "Indication limit", level: "DIAGNOSIS", icdCodes: ["G43"], dateFrom: null, dateTo: null, sourceRef: { page: 9 } } as never);
    expect(v.service).toBe("MRI Brain");
    expect(JSON.stringify(v)).not.toContain("sourceRef");
    expect(JSON.stringify(v)).not.toContain("page");
  });
});

describe("F7.2 projectCapitationRule", () => {
  it("summarises a CAPITATION rule (rate/basis/carve-outs) and never leaks poolId", () => {
    const v = projectCapitationRule({ ruleKind: "CAPITATION", params: { rate: 800, payBasis: "PMPM", carveOutCodes: ["99285", "70551"], poolId: "pool-secret", scheme: "X" } });
    expect(v).not.toBeNull();
    expect(v!.rate).toBe("800");
    expect(v!.basis).toBe("PMPM");
    expect(v!.carveOutCodes).toEqual(["99285", "70551"]);
    expect(JSON.stringify(v)).not.toContain("poolId");
    expect(JSON.stringify(v)).not.toContain("pool-secret");
  });
  it("returns null for a non-capitation pricing rule (FFS pricing is not a capitation summary)", () => {
    expect(projectCapitationRule({ ruleKind: "FIXED", params: {} })).toBeNull();
    expect(projectCapitationRule({ ruleKind: "DISCOUNT_OFF_BILLED", params: { pct: 10 } })).toBeNull();
  });
  it("tolerates a malformed params blob", () => {
    const v = projectCapitationRule({ ruleKind: "PER_VISIT_CASE_RATE", params: null });
    expect(v).not.toBeNull();
    expect(v!.carveOutCodes).toEqual([]);
    expect(v!.rate).toBeNull();
  });
});
