import { describe, expect, it } from "vitest";
import { resolveMemberEnrolmentDates } from "@/lib/member-enrolment";

const TODAY = "2026-08-13";

describe("P05.06 exact member enrolment calendar days", () => {
  it("round-trips a leap-day DOB and cover start without an instant conversion", () => {
    const result = resolveMemberEnrolmentDates(
      {
        dateOfBirth: "2024-02-29",
        effectiveDate: "2026-02-28",
        relationship: "CHILD",
      },
      TODAY,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        dateOfBirth: "2024-02-29",
        requestedEffectiveDate: "2026-02-28",
        birthNotificationDate: null,
        coverStartDate: "2026-02-28",
        newbornRuleApplied: false,
      },
    });
  });

  it("applies CT-033 on the exact DOB when a child is notified on day 30", () => {
    const result = resolveMemberEnrolmentDates(
      {
        dateOfBirth: "2026-07-01",
        effectiveDate: "2026-08-13",
        birthNotificationDate: "2026-07-31",
        relationship: "CHILD",
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.coverStartDate).toBe("2026-07-01");
      expect(result.value.newbornRuleApplied).toBe(true);
    }
  });

  it("does not apply CT-033 one day beyond the notification window", () => {
    const result = resolveMemberEnrolmentDates(
      {
        dateOfBirth: "2026-07-01",
        effectiveDate: "2026-08-13",
        birthNotificationDate: "2026-08-01",
        relationship: "CHILD",
      },
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.coverStartDate).toBe("2026-08-13");
  });

  it("rejects impossible, future and before-birth combinations with field ownership", () => {
    expect(
      resolveMemberEnrolmentDates(
        { dateOfBirth: "2026-02-30", effectiveDate: TODAY, relationship: "PRINCIPAL" },
        TODAY,
      ),
    ).toMatchObject({ ok: false, fieldErrors: { dateOfBirth: expect.any(Array) } });
    expect(
      resolveMemberEnrolmentDates(
        { dateOfBirth: "2026-08-14", effectiveDate: TODAY, relationship: "PRINCIPAL" },
        TODAY,
      ),
    ).toMatchObject({ ok: false, fieldErrors: { dateOfBirth: expect.any(Array) } });
    expect(
      resolveMemberEnrolmentDates(
        { dateOfBirth: "2026-08-10", effectiveDate: "2026-08-09", relationship: "CHILD" },
        TODAY,
      ),
    ).toMatchObject({ ok: false, fieldErrors: { effectiveDate: expect.any(Array) } });
  });

  it("refuses a birth notification on a non-child or before the birth", () => {
    const nonChild = resolveMemberEnrolmentDates(
      {
        dateOfBirth: "1990-01-01",
        effectiveDate: TODAY,
        birthNotificationDate: "2026-08-10",
        relationship: "PRINCIPAL",
      },
      TODAY,
    );
    expect(nonChild).toMatchObject({
      ok: false,
      fieldErrors: { birthNotificationDate: [expect.stringMatching(/only to a child/i)] },
    });

    const beforeBirth = resolveMemberEnrolmentDates(
      {
        dateOfBirth: "2026-08-10",
        effectiveDate: TODAY,
        birthNotificationDate: "2026-08-09",
        relationship: "CHILD",
      },
      TODAY,
    );
    expect(beforeBirth).toMatchObject({
      ok: false,
      fieldErrors: { birthNotificationDate: [expect.stringMatching(/before/i)] },
    });
  });
});
