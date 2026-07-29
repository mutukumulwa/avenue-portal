/**
 * F7.4 — provider master-data change policy (pure).
 *
 * Pins the category allow-list (a disallowed field is DETECTED, never silently
 * kept), sensitive-value masking (the full value never survives projection),
 * the current-snapshot masking, the status transition table, and the
 * maker/checker risk gate.
 */
import { describe, it, expect } from "vitest";
import {
  MASTER_DATA_CATEGORY_POLICY,
  buildCurrentSnapshot,
  canTransitionMasterData,
  isMasterDataTerminal,
  maskSensitive,
  projectProposedValues,
  requiresMakerChecker,
} from "@/server/services/provider-master-data-change/policy";

describe("F7.4 projectProposedValues", () => {
  it("flags disallowed fields and keeps only allow-listed ones", () => {
    const p = projectProposedValues("CONTACT", { phone: "0700", email: "a@b.co", tier: "GOLD", creditLimit: 9 });
    expect(p.disallowed.sort()).toEqual(["creditLimit", "tier"]);
    expect(p.stored).toEqual({ phone: "0700", email: "a@b.co" });
  });
  it("masks sensitive fields before storage (full value never persists)", () => {
    const p = projectProposedValues("BANK", { bankName: "KCB", accountNumber: "1234567890", accountName: "Aga Khan Ltd" });
    expect(p.masked.sort()).toEqual(["accountName", "accountNumber"]);
    expect(p.stored.accountNumber).toBe("••••7890");
    expect(p.stored.bankName).toBe("KCB"); // non-sensitive kept
    expect(JSON.stringify(p.stored)).not.toContain("1234567890");
  });
});

describe("F7.4 buildCurrentSnapshot", () => {
  it("reads only allow-listed fields and masks sensitive ones", () => {
    const snap = buildCurrentSnapshot("CONTACT", { phone: "0700", email: "a@b.co", secretColumn: "x", isOpen24Hours: true });
    expect(Object.keys(snap).sort()).toEqual(["address", "contactPerson", "county", "email", "isOpen24Hours", "operatingHours", "phone"]);
    expect(snap.phone).toBe("0700");
    expect(snap.secretColumn).toBeUndefined();
  });
  it("masks a sensitive current value", () => {
    const snap = buildCurrentSnapshot("BANK", { accountNumber: "55554444" });
    expect(snap.accountNumber).toBe("••••4444");
  });
});

describe("F7.4 maskSensitive", () => {
  it("keeps only a trailing hint; short values are fully hidden", () => {
    expect(maskSensitive("1234567890")).toBe("••••7890");
    expect(maskSensitive("abc")).toBe("••••");
    expect(maskSensitive(null)).toBe("••••");
  });
});

describe("F7.4 category policy risk + activation", () => {
  it("BANK is HIGH-risk, sensitive, evidence-required, and NOT auto-activated", () => {
    const b = MASTER_DATA_CATEGORY_POLICY.BANK;
    expect(b.risk).toBe("HIGH");
    expect(b.autoApply).toBe(false);
    expect(b.requiresEvidence).toBe(true);
    expect(b.sensitiveFields).toContain("accountNumber");
    expect(requiresMakerChecker(b.risk)).toBe(true);
  });
  it("CONTACT is LOW-risk and auto-activated; requiresMakerChecker(LOW) is false", () => {
    expect(MASTER_DATA_CATEGORY_POLICY.CONTACT.autoApply).toBe(true);
    expect(requiresMakerChecker("LOW")).toBe(false);
  });
});

describe("F7.4 transition table", () => {
  it("submitted may start review or request info, but not jump straight to approved", () => {
    expect(canTransitionMasterData("SUBMITTED", "UNDER_REVIEW")).toBe(true);
    expect(canTransitionMasterData("SUBMITTED", "INFORMATION_REQUIRED")).toBe(true);
    expect(canTransitionMasterData("SUBMITTED", "APPROVED")).toBe(false);
  });
  it("only PENDING_CHECKER or UNDER_REVIEW/PROVIDER_RESPONDED reach APPROVED", () => {
    expect(canTransitionMasterData("UNDER_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionMasterData("PROVIDER_RESPONDED", "APPROVED")).toBe(true);
    expect(canTransitionMasterData("PENDING_CHECKER", "APPROVED")).toBe(true);
    expect(canTransitionMasterData("INFORMATION_REQUIRED", "APPROVED")).toBe(false);
  });
  it("terminal states are dead ends", () => {
    for (const s of ["APPROVED", "REJECTED", "WITHDRAWN"] as const) {
      expect(isMasterDataTerminal(s)).toBe(true);
      expect(canTransitionMasterData(s, "UNDER_REVIEW")).toBe(false);
    }
  });
});
