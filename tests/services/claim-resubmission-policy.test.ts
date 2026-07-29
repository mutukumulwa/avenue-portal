/**
 * F5.9 — pure resubmission policy: the reason resolver (safe, fraud never disclosed) and
 * the timezone-safe deadline. No DB.
 */
import { describe, it, expect } from "vitest";
import { resolveResubmissionReason, resubmissionDeadline } from "@/server/services/claim-resubmission/policy";

describe("F5.9 resolveResubmissionReason", () => {
  const legacy = (declineReasonCode: string | null) => resolveResubmissionReason({ lineReasonRows: [], claimReasonRow: null, declineReasonCode });

  it("a correctable legacy reason (INVALID_DOCS) is resubmittable with a safe remedy", () => {
    const r = legacy("INVALID_DOCS");
    expect(r.resubmissionAllowed).toBe(true);
    expect(r.safeReason).toMatch(/document/i);
  });

  it("a substantive legacy reason (EXCLUSION) is not resubmittable", () => {
    expect(legacy("EXCLUSION").resubmissionAllowed).toBe(false);
  });

  it("NEVER discloses an internal / fraud rationale", () => {
    const r = legacy("FRAUD_SUSPECTED");
    expect(r.resubmissionAllowed).toBe(false);
    expect(r.safeReason).not.toMatch(/fraud|fwa|abuse|suspect|investigat/i);
    expect(r.safeReason).toMatch(/contact the payer/i);
  });

  it("an unknown or blank decline code is conservatively not resubmittable", () => {
    expect(legacy("SOMETHING_ELSE").resubmissionAllowed).toBe(false);
    expect(legacy(null).resubmissionAllowed).toBe(false);
  });

  it("the canonical catalog row wins over the legacy map", () => {
    const r = resolveResubmissionReason({
      lineReasonRows: [],
      claimReasonRow: { resubmissionAllowed: true, providerDescription: "Missing document — attach and resubmit." },
      declineReasonCode: "FRAUD_SUSPECTED", // would be false via the legacy map
    });
    expect(r.resubmissionAllowed).toBe(true);
    expect(r.safeReason).toMatch(/attach/i);
  });

  it("line-level reasons win, and a single forbidding line blocks the whole claim", () => {
    const r = resolveResubmissionReason({
      lineReasonRows: [
        { resubmissionAllowed: true, providerDescription: "Doc missing." },
        { resubmissionAllowed: false, providerDescription: "Service excluded." },
      ],
      claimReasonRow: null,
      declineReasonCode: "INVALID_DOCS",
    });
    expect(r.resubmissionAllowed).toBe(false);
    expect(r.safeReason).toContain("Doc missing.");
    expect(r.safeReason).toContain("Service excluded.");
  });
});

describe("F5.9 resubmissionDeadline (UTC, deadline day inclusive)", () => {
  const dos = new Date("2026-07-01T10:00:00Z");

  it("no window ⇒ no deadline", () => {
    expect(resubmissionDeadline({ windowDays: null, basis: "SERVICE_DATE", dateOfService: dos, dischargeDate: null })).toBeNull();
    expect(resubmissionDeadline({ windowDays: 0, basis: "SERVICE_DATE", dateOfService: dos, dischargeDate: null })).toBeNull();
  });

  it("SERVICE_DATE + 30 days ⇒ end of 31 Jul (UTC)", () => {
    const d = resubmissionDeadline({ windowDays: 30, basis: "SERVICE_DATE", dateOfService: dos, dischargeDate: null })!;
    expect(d.toISOString()).toBe("2026-07-31T23:59:59.999Z");
  });

  it("DISCHARGE_DATE basis uses discharge, falling back to service date", () => {
    const disc = new Date("2026-07-10T00:00:00Z");
    expect(resubmissionDeadline({ windowDays: 5, basis: "DISCHARGE_DATE", dateOfService: dos, dischargeDate: disc })!.toISOString()).toBe("2026-07-15T23:59:59.999Z");
    expect(resubmissionDeadline({ windowDays: 5, basis: "DISCHARGE_DATE", dateOfService: dos, dischargeDate: null })!.toISOString()).toBe("2026-07-06T23:59:59.999Z");
  });

  it("MONTHLY_BATCH counts from the end of the service month", () => {
    const d = resubmissionDeadline({ windowDays: 10, basis: "MONTHLY_BATCH", dateOfService: dos, dischargeDate: null })!;
    expect(d.toISOString()).toBe("2026-08-10T23:59:59.999Z"); // 31 Jul + 10 days
  });
});
