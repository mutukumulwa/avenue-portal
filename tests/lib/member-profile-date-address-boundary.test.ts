import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P05.06 member profile read boundary", () => {
  const page = readFileSync("src/app/(admin)/members/[id]/page.tsx", "utf8");
  const tabs = readFileSync("src/components/members/MemberProfileTabs.tsx", "utf8");
  const hrForm = readFileSync("src/app/(hr)/hr/roster/new/HRAddMemberForm.tsx", "utf8");
  const migration = readFileSync(
    "prisma/migrations/20260813001200_member_structured_address/migration.sql",
    "utf8",
  );

  it("shows the exact cover-start day instead of a month-only valid period", () => {
    expect(page).toContain("coverStartDate: member.coverStartDate?.toISOString() ?? null");
    expect(tabs).toContain('label: "Cover starts"');
    expect(tabs).toContain("fmtCalendarDate(member.coverStartDate ?? member.enrollmentDate)");
    expect(tabs).not.toContain('month: "short", year: "numeric"');
  });

  it("sends address display lines but never raw coordinates to the Client Component", () => {
    expect(page).toContain("addressLines:");
    expect(page).toContain("hasAddressCoordinates:");
    expect(page).not.toContain("addressLatitude: member.addressLatitude");
    expect(page).not.toContain("addressLongitude: member.addressLongitude");
    expect(tabs).toContain("Precise coordinates recorded with member consent.");
  });

  it("enforces coordinate pairing, consent and ranges in the database too", () => {
    expect(migration).toContain('CONSTRAINT "member_address_coordinates_pair"');
    expect(migration).toContain('CONSTRAINT "member_address_coordinates_consent"');
    expect(migration).toContain('CONSTRAINT "member_address_latitude_range"');
    expect(migration).toContain('CONSTRAINT "member_address_longitude_range"');
  });

  it("states HR joiner timing and back-date governance before submit", () => {
    expect(hrForm).toContain("Eligibility start if approved");
    expect(hrForm).toContain("approved back-date override");
    expect(hrForm).toContain("Submitting this form does not change cover");
    expect(hrForm).toContain("does not activate cover early");
  });
});
