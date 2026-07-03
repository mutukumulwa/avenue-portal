import { describe, it, expect } from "vitest";
import { slaFor, slaState } from "@/lib/claims-sla";

describe("slaFor (WP-A1 / D2 — contract-first payment SLA)", () => {
  it("outpatient defaults to 24 h", () => {
    const spec = slaFor({ serviceType: "OUTPATIENT" });
    expect(spec.class).toBe("OP_24H");
    expect(spec.payWithinHours).toBe(24);
  });

  it("day-case and emergency follow the outpatient class", () => {
    expect(slaFor({ serviceType: "DAY_CASE" }).class).toBe("OP_24H");
    expect(slaFor({ serviceType: "EMERGENCY" }).class).toBe("OP_24H");
  });

  it("inpatient defaults to weekly cycle with 30-day ceiling", () => {
    const spec = slaFor({ serviceType: "INPATIENT" });
    expect(spec.class).toBe("IP_WEEKLY");
    expect(spec.payWithinHours).toBe(7 * 24);
    expect(spec.hardCeilingHours).toBe(30 * 24);
  });

  it("contract calendar terms override the serviceType default", () => {
    const spec = slaFor({
      serviceType: "INPATIENT",
      contractTerms: { paymentTermDays: 14, paymentTermType: "CALENDAR" },
    });
    expect(spec.class).toBe("CONTRACT");
    expect(spec.payWithinHours).toBe(14 * 24);
  });

  it("BUSINESS days convert at 7/5 calendar ratio (Jubilee 10 working days ≈ 14 d)", () => {
    const spec = slaFor({
      serviceType: "INPATIENT",
      contractTerms: { paymentTermDays: 10, paymentTermType: "BUSINESS" },
    });
    expect(spec.payWithinHours).toBe(14 * 24);
  });

  it("contract terms apply to outpatient claims too", () => {
    const spec = slaFor({
      serviceType: "OUTPATIENT",
      contractTerms: { paymentTermDays: 2, paymentTermType: "CALENDAR" },
    });
    expect(spec.class).toBe("CONTRACT");
    expect(spec.payWithinHours).toBe(48);
  });

  it("zero/invalid contract days fall back to defaults", () => {
    const spec = slaFor({
      serviceType: "OUTPATIENT",
      contractTerms: { paymentTermDays: 0, paymentTermType: "CALENDAR" },
    });
    expect(spec.class).toBe("OP_24H");
  });

  it("inpatient contract ceiling never drops below 30 days", () => {
    const spec = slaFor({
      serviceType: "INPATIENT",
      contractTerms: { paymentTermDays: 7, paymentTermType: "CALENDAR" },
    });
    expect(spec.hardCeilingHours).toBe(30 * 24);
  });
});

describe("slaState", () => {
  const now = new Date("2026-07-03T12:00:00Z");

  it("computes age and due-in for a fresh OP claim", () => {
    const s = slaState({
      receivedAt: new Date("2026-07-03T06:00:00Z"),
      serviceType: "OUTPATIENT",
      now,
    });
    expect(s.ageHours).toBe(6);
    expect(s.dueInHours).toBe(18);
    expect(s.breached).toBe(false);
    expect(s.critical).toBe(false);
  });

  it("flags an OP claim older than 24 h as breached", () => {
    const s = slaState({
      receivedAt: new Date("2026-07-02T06:00:00Z"),
      serviceType: "OUTPATIENT",
      now,
    });
    expect(s.breached).toBe(true);
    expect(s.critical).toBe(false);
  });

  it("flags an OP claim older than 72 h as critical", () => {
    const s = slaState({
      receivedAt: new Date("2026-06-29T06:00:00Z"),
      serviceType: "OUTPATIENT",
      now,
    });
    expect(s.critical).toBe(true);
  });

  it("an 8-day-old IP claim is breached but not critical", () => {
    const s = slaState({
      receivedAt: new Date("2026-06-25T12:00:00Z"),
      serviceType: "INPATIENT",
      now,
    });
    expect(s.breached).toBe(true);
    expect(s.critical).toBe(false);
  });

  it("contract terms drive breach for contracted claims", () => {
    const s = slaState({
      receivedAt: new Date("2026-06-30T12:00:00Z"), // 72h old
      serviceType: "OUTPATIENT",
      contractTerms: { paymentTermDays: 2, paymentTermType: "CALENDAR" },
      now,
    });
    expect(s.spec.class).toBe("CONTRACT");
    expect(s.breached).toBe(true);
  });
});
