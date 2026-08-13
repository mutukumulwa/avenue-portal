import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicalMemberImportContent,
  createMemberImportPreviewToken,
  memberImportHeaderNotes,
  preflightMemberImport,
  verifyMemberImportPreviewToken,
} from "@/server/services/member-import-preflight.service";

process.env.NEXTAUTH_SECRET ??= "member-import-tests-use-a-32-byte-secret";

const group = {
  id: "g1",
  name: "Staff Scheme",
  status: "ACTIVE",
  packageId: "pkg1",
  packageVersionId: "pv1",
  package: { tenantId: "t1", status: "ACTIVE", maxAge: 65, dependentMaxAge: 24 },
  packageVersion: { packageId: "pkg1", status: "ACTIVE" },
};

const db = {
  group: { findFirst: vi.fn() },
  member: { findMany: vi.fn() },
};

const row = (overrides: Record<string, unknown> = {}) => ({
  row: 2,
  firstName: "Jane",
  lastName: "Doe",
  idNumber: "ID-1",
  dateOfBirth: "1990-01-01",
  gender: "FEMALE",
  phone: "",
  email: "",
  relationship: "PRINCIPAL",
  principalIdNumber: "",
  sourceReference: "HR-LTR-2026-0042",
  ...overrides,
});

const run = (
  rawRows: Record<string, unknown>[],
  lane: "MEMBERS_ADMIN" | "HR_ENDORSEMENT" = "MEMBERS_ADMIN",
) =>
  preflightMemberImport({
    db: db as never,
    tenantId: "t1",
    groupId: "g1",
    lane,
    rawRows,
    effectiveDate: new Date("2026-08-13T00:00:00Z"),
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.group.findFirst.mockResolvedValue(group);
  db.member.findMany.mockResolvedValue([]);
});

describe("P06.01 one member-import preflight", () => {
  it("ignores a browser-posted verdict and derives validity from the row itself", async () => {
    const result = await run([row({ error: "the browser says this is invalid" })]);
    expect(result.validCount).toBe(1);
    expect(result.rows[0].error).toBeUndefined();
  });

  it("normalizes canonical values once for preview and commit", async () => {
    const result = await run([
      row({
        firstName: "  Jane   Mary ",
        idNumber: " id 1 ",
        phone: "0772 555 042",
        email: " JANE@Example.COM ",
      }),
    ]);
    expect(result.rows[0]).toMatchObject({
      firstName: "Jane Mary",
      idNumber: "ID1",
      phone: "+256772555042",
      email: "jane@example.com",
    });
  });

  it("blocks only the repeated national ID while treating shared contact as a warning", async () => {
    const result = await run([
      row({ idNumber: "ID1", phone: "0772555042" }),
      row({ row: 3, firstName: "Janet", idNumber: " id 1 ", phone: "+256772555042" }),
    ]);
    expect(result.validCount).toBe(1);
    expect(result.rows[1].error).toMatch(/duplicate of an earlier row.*national id/i);
    expect(result.rows[0].warnings?.join(" ")).toMatch(/households often share/i);
  });

  it("does not let an already-invalid source row poison a valid row's identity verdict", async () => {
    const result = await run([
      row({ idNumber: "SAME", dateOfBirth: "not-a-date" }),
      row({ idNumber: "SAME", firstName: "Valid", row: 3 }),
    ]);
    expect(result.validCount).toBe(1);
    expect(result.rows[0].error).toMatch(/real date of birth/i);
    expect(result.rows[1].error).toBeUndefined();
  });

  it("rejects a dependant whose existing principal is not allowed to add dependants", async () => {
    db.member.findMany.mockImplementation(async (args: MockDbArgs) =>
      args?.where?.relationship === "PRINCIPAL"
        ? [{ nationalIdNormalized: "P1", status: "LAPSED" }]
        : [],
    );
    const result = await run([
      row({
        idNumber: "D1",
        relationship: "CHILD",
        principalIdNumber: "P1",
        dateOfBirth: "2015-01-01",
      }),
    ]);
    expect(result.validCount).toBe(0);
    expect(result.rows[0].error).toMatch(/not available while this membership is lapsed/i);
  });

  it("requires HR evidence in both the row and the HR template header", async () => {
    const result = await run([row({ sourceReference: "" })], "HR_ENDORSEMENT");
    expect(result.validCount).toBe(0);
    expect(result.rows[0].error).toMatch(/source.*reference is required/i);

    const notes = memberImportHeaderNotes(
      ["firstName", "lastName", "dateOfBirth", "gender", "relationship"],
      "HR_ENDORSEMENT",
    );
    expect(notes.join(" ")).toMatch(/missing required column "sourceReference"/i);
  });

  it("fails closed if the scheme package is inactive", async () => {
    db.group.findFirst.mockResolvedValue({
      ...group,
      package: { ...group.package, status: "ARCHIVED" },
    });
    const result = await run([row()]);
    expect(result.rows).toEqual([]);
    expect(result.error).toMatch(/package is not active/i);
    expect(db.member.findMany).not.toHaveBeenCalled();
  });

  it("fails closed if the pinned version belongs to another package", async () => {
    db.group.findFirst.mockResolvedValue({
      ...group,
      packageVersion: { packageId: "other-package", status: "ACTIVE" },
    });
    const result = await run([row()]);
    expect(result.error).toMatch(/not pinned to an approved package version/i);
    expect(db.member.findMany).not.toHaveBeenCalled();
  });

  it("replaces a forged or nonsensical row number with the real array position", async () => {
    const result = await run([
      row({ row: 999_999 }),
      row({ row: "not-a-number", idNumber: "ID2" }),
    ]);
    expect(result.rows.map((item) => item.row)).toEqual([2, 3]);
  });

  it("uses lane-specific business content for the replay key", async () => {
    const result = await run([row({ sourceReference: "HR-A" })]);
    const changedEvidence = result.rows.map((item) => ({
      ...item,
      sourceReference: "HR-B",
    }));
    expect(canonicalMemberImportContent(result.rows, "MEMBERS_ADMIN")).toBe(
      canonicalMemberImportContent(changedEvidence, "MEMBERS_ADMIN"),
    );
    expect(canonicalMemberImportContent(result.rows, "HR_ENDORSEMENT")).not.toBe(
      canonicalMemberImportContent(changedEvidence, "HR_ENDORSEMENT"),
    );
  });

  it("authenticates both canonical values and the server's preview verdict mask", async () => {
    const result = await run([row()]);
    const claim = {
      lane: "MEMBERS_ADMIN" as const,
      tenantId: "t1",
      groupId: "g1",
      effectiveDate: "2026-08-13",
      rows: result.rows,
    };
    const token = createMemberImportPreviewToken(claim);
    expect(verifyMemberImportPreviewToken(claim, token)).toBe(true);
    expect(verifyMemberImportPreviewToken({
      ...claim,
      rows: claim.rows.map((item) => ({ ...item, firstName: "Tampered" })),
    }, token)).toBe(false);
    expect(verifyMemberImportPreviewToken({
      ...claim,
      rows: claim.rows.map((item) => ({ ...item, error: "browser-added verdict" })),
    }, token)).toBe(false);
  });

  it("documents the HR evidence column everywhere the shared template is offered", () => {
    const template = readFileSync("public/member-import-template.csv", "utf8");
    const adminPage = readFileSync("src/app/(admin)/members/import/page.tsx", "utf8");
    const hrPage = readFileSync("src/app/(hr)/hr/roster/import/page.tsx", "utf8");
    expect(template.split(/\r?\n/, 1)[0]).toContain("sourceReference");
    expect(adminPage).toContain('["sourceReference",    "HR only"');
    expect(hrPage).toContain('["sourceReference",    "Yes"');
  });
});
