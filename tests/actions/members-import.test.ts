import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  group: { findFirst: vi.fn(), findUnique: vi.fn() },
  member: { findFirst: vi.fn(), findMany: vi.fn() },
  package: { findUnique: vi.fn() },
  importBatch: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  endorsement: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "u1", tenantId: "t1", groupId: "g-hr" } }),
  ROLES: { MEMBER_OPS: "MEMBER_OPS", HR: "HR" },
}));

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));

const createMember = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/members.service", () => ({
  MembersService: { createMember },
}));

const checkEnrolmentAge = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/eligibility/enrolment-age", () => ({ checkEnrolmentAge }));

const job = vi.hoisted(() => ({
  reserve: vi.fn(),
  claim: vi.fn(),
  finishRow: vi.fn(),
  finalize: vi.fn(),
}));
vi.mock("@/server/services/member-import-job.service", () => ({
  MemberImportJobService: job,
}));

import { parseImportAction, confirmImportAction } from "@/app/(admin)/members/import/actions";
import { parseHRImportAction, confirmHRImportAction } from "@/app/(hr)/hr/roster/import/actions";
import { createMemberImportPreviewToken } from "@/server/services/member-import-preflight.service";

const YEAR = new Date().getFullYear();
const PREFLIGHT_DATE = "2026-08-13";
process.env.NEXTAUTH_SECRET ??= "member-import-tests-use-a-32-byte-secret";

type Row = {
  row: number; firstName: string; lastName: string; idNumber: string;
  dateOfBirth: string; gender: string; phone: string; email: string;
  relationship: string; principalIdNumber: string; sourceReference: string;
  error?: string; warnings?: string[];
};

function row(partial: Partial<Row> = {}): Row {
  return {
    row: 2, firstName: "John", lastName: "Doe", idNumber: "", dateOfBirth: "1990-01-01",
    gender: "MALE", phone: "", email: "", relationship: "PRINCIPAL", principalIdNumber: "",
    sourceReference: "HR-BULK-2026-001",
    ...partial,
  };
}

function confirmFd(rows: Row[], extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  f.set("groupId", "g1");
  f.set("rows", JSON.stringify(rows));
  f.set("preflightDate", PREFLIGHT_DATE);
  f.set("preflightToken", createMemberImportPreviewToken({
    lane: "MEMBERS_ADMIN",
    tenantId: "t1",
    groupId: "g1",
    effectiveDate: PREFLIGHT_DATE,
    rows,
  }));
  Object.entries(extra).forEach(([k, v]) => f.set(k, v));
  return f;
}

function csvFile(content: string, name = "members.csv", type = "text/csv"): File {
  return new File([content], name, { type });
}
function parseFd(file: File): FormData {
  const f = new FormData();
  f.set("file", file);
  f.set("groupId", "g1");
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.group.findFirst.mockResolvedValue({
    id: "g1",
    name: "Test Group",
    status: "ACTIVE",
    packageId: "pkg1",
    packageVersionId: "pv1",
    package: { tenantId: "t1", status: "ACTIVE", maxAge: null, dependentMaxAge: null },
    packageVersion: { packageId: "pkg1", status: "ACTIVE" },
  });
  mockPrisma.group.findUnique.mockResolvedValue({ packageId: "pkg1" });
  mockPrisma.package.findUnique.mockResolvedValue({ maxAge: null, dependentMaxAge: null });
  mockPrisma.member.findFirst.mockResolvedValue(null);
  mockPrisma.member.findMany.mockResolvedValue([]);
  mockPrisma.importBatch.findUnique.mockResolvedValue(null);
  mockPrisma.importBatch.create.mockResolvedValue({ id: "batch1" });
  mockPrisma.importBatch.update.mockResolvedValue({});
  mockPrisma.endorsement.findMany.mockResolvedValue([]);
  mockPrisma.endorsement.create.mockResolvedValue({});
  createMember.mockResolvedValue({ member: { id: "created-1" }, warnings: [] });
  checkEnrolmentAge.mockReturnValue({ ok: true });
  job.reserve.mockResolvedValue({
    created: true,
    job: { id: "batch1", batchRef: "IMP-TEST", status: "QUEUED", imported: 0, failed: [], terminal: false },
  });
  job.claim.mockResolvedValue(true);
  job.finishRow.mockResolvedValue(undefined);
  job.finalize.mockImplementation(async () => {
    const reserved = job.reserve.mock.calls.at(-1)?.[1]?.rows ?? [];
    const preflightFailed = reserved.filter((item: Row) => item.error).map((item: Row) => ({
      row: item.row, name: `${item.firstName} ${item.lastName}`.trim(), error: item.error!,
    }));
    const runtimeFailed = job.finishRow.mock.calls
      .filter((call) => call[3]?.status !== "ACCEPTED")
      .map((call) => ({ row: call[2], name: "", error: call[3]?.message ?? "failed" }));
    const imported = job.finishRow.mock.calls.filter((call) => call[3]?.status === "ACCEPTED").length;
    return { id: "batch1", batchRef: "IMP-TEST", status: preflightFailed.length || runtimeFailed.length ? "PARTIAL" : "SUCCEEDED",
      imported, failed: [...preflightFailed, ...runtimeFailed], terminal: true };
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WP-B2 — parser safety (admin lane; HR lane shares the code)
// ─────────────────────────────────────────────────────────────────────────
describe("parseImportAction — parser safety (WP-B2)", () => {
  it("rejects an empty upload", async () => {
    const res = await parseImportAction(null, parseFd(csvFile("")));
    expect(res.error).toMatch(/no file uploaded/i);
  });

  it("header-only file refuses with a clear message (no rows)", async () => {
    const res = await parseImportAction(null, parseFd(csvFile("firstName,lastName,dateOfBirth,gender,relationship\n")));
    expect(res.rows).toHaveLength(0);
    expect(res.error).toMatch(/no data rows/i);
  });

  it("aborts the WHOLE parse when any isExample row is present", async () => {
    const csv = "firstName,lastName,dateOfBirth,gender,relationship,isExample\nJane,Doe,1990-01-01,FEMALE,PRINCIPAL,true\n";
    const res = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(res.rows).toHaveLength(0);
    expect(res.error).toMatch(/example rows/i);
  });

  it("rejects a wrong file type before parsing", async () => {
    const res = await parseImportAction(null, parseFd(csvFile("whatever", "roster.pdf", "application/pdf")));
    expect(res.error).toMatch(/unsupported file type/i);
  });

  it("rejects a binary file that carries NUL bytes (no partial data, no throw)", async () => {
    const res = await parseImportAction(null, parseFd(csvFile("PK\u0000\u0003binary", "roster.csv", "text/csv")));
    expect(res.rows).toHaveLength(0);
    expect(res.error).toMatch(/does not look like a text csv/i);
  });

  it("rejects the whole file when Papa reports a structural row error", async () => {
    const csv = 'firstName,lastName,dateOfBirth,gender,relationship\n"Jane,Doe,1990-01-01,FEMALE,PRINCIPAL\n';
    const res = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(res.rows).toEqual([]);
    expect(res.error).toMatch(/no partial preview was accepted/i);
  });

  it("maps aliased + reordered headers by NAME (no column shift)", async () => {
    // Columns deliberately reordered and snake_cased.
    const csv = "relationship,dob,last_name,first_name,gender\nPRINCIPAL,1990-05-05,Nakato,Grace,FEMALE\n";
    const res = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(res.errorCount).toBe(0);
    expect(res.rows[0]).toMatchObject({ firstName: "Grace", lastName: "Nakato", dateOfBirth: "1990-05-05", gender: "FEMALE", relationship: "PRINCIPAL" });
  });

  it("notes an unknown column but still imports the known ones", async () => {
    const csv = "firstName,lastName,dateOfBirth,gender,relationship,salary\nJane,Doe,1990-01-01,FEMALE,PRINCIPAL,999\n";
    const res = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(res.errorCount).toBe(0);
    expect(res.notes?.join(" ")).toMatch(/ignored unrecognised column/i);
    expect(res.notes?.join(" ")).toMatch(/salary/i);
  });

  it("notes a missing required header AND every row errors on that field", async () => {
    const csv = "firstName,lastName,dateOfBirth,relationship\nJane,Doe,1990-01-01,PRINCIPAL\n";
    const res = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(res.notes?.join(" ")).toMatch(/missing required column "gender"/i);
    expect(res.rows[0].error).toMatch(/valid gender/i);
  });

  // UAT-HF P06.07 (DEF-038) — this asserted the DEFECT: that ingest rewrote the
  // source text. "The committed roster preserves the source text exactly."
  //
  // The formula defence was not removed, it moved to the boundary where the risk
  // actually lives. A stored name is data; a spreadsheet only evaluates a cell
  // when it OPENS an export, and `csvSafeCell` neutralizes every exported cell
  // regardless of how the value was stored. Both halves are asserted below,
  // because dropping the import call would be wrong if the export did not hold.
  it("preserves a formula-shaped name EXACTLY on ingest", async () => {
    const csv = "firstName,lastName,dateOfBirth,gender,relationship\n=HYPERLINK(\"http://x\"),Doe,1990-01-01,MALE,PRINCIPAL\n";
    const res = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(res.rows[0].firstName).toBe('=HYPERLINK("http://x")');
    expect(res.rows[0].firstName.startsWith("'")).toBe(false);
  });

  it("and that name is still neutralized when it reaches a spreadsheet", async () => {
    const { csvSafeCell } = await import("@/lib/csv-safe");
    // Quoted because it contains a comma-free but quote-bearing value; the
    // leading apostrophe is what stops evaluation.
    expect(csvSafeCell('=HYPERLINK("http://x")')).toContain("'=HYPERLINK");
  });

  it("uses strict calendar dates in preview, so an impossible day cannot look valid", async () => {
    const csv = "firstName,lastName,dateOfBirth,gender,relationship\nJane,Doe,2026-02-30,FEMALE,PRINCIPAL\n";
    const preview = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(preview.validCount).toBe(0);
    expect(preview.rows[0].error).toMatch(/real date of birth/i);

    const confirm = await confirmImportAction(
      null,
      confirmFd(preview.rows),
    );
    expect(confirm.failed[0].error).toBe(preview.rows[0].error);
    expect(createMember).not.toHaveBeenCalled();
  });

  it("rejects malformed phone and email in preview rather than deferring them to commit", async () => {
    const csv = "firstName,lastName,dateOfBirth,gender,relationship,phone,email\nJane,Doe,1990-01-01,FEMALE,PRINCIPAL,+254700123456,bad\n";
    const result = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(result.validCount).toBe(0);
    expect(result.rows[0].error).toMatch(/Ugandan phone/i);
    expect(result.rows[0].error).toMatch(/valid email/i);
  });

  it("marks a current database national-ID conflict during preview", async () => {
    mockPrisma.member.findMany.mockResolvedValue([
      {
        nationalIdNormalized: "ID1",
        phoneNormalized: null,
        emailNormalized: null,
        firstName: "Existing",
        lastName: "Member",
        dateOfBirth: new Date("1980-01-01T00:00:00Z"),
      },
    ]);
    const csv = "firstName,lastName,idNumber,dateOfBirth,gender,relationship\nJane,Doe,ID1,1990-01-01,FEMALE,PRINCIPAL\n";
    const result = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(result.validCount).toBe(0);
    expect(result.rows[0].error).toMatch(/national ID is already recorded/i);
    expect(result.rows[0].error).not.toMatch(/Existing|Member/);
  });

  it("keeps shared phones as visible candidate warnings, never hard conflicts", async () => {
    mockPrisma.member.findMany.mockResolvedValue([
      {
        nationalIdNormalized: null,
        phoneNormalized: "+256772555042",
        emailNormalized: null,
        firstName: "Other",
        lastName: "Household",
        dateOfBirth: new Date("1980-01-01T00:00:00Z"),
      },
    ]);
    const csv = "firstName,lastName,dateOfBirth,gender,relationship,phone\nJane,Doe,1990-01-01,FEMALE,PRINCIPAL,0772555042\n";
    const result = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(result.validCount).toBe(1);
    expect(result.rows[0].error).toBeUndefined();
    expect(result.rows[0].warnings?.join(" ")).toMatch(/households often share/i);
  });

  it("refuses preview against an inactive scheme or unapproved package pin", async () => {
    mockPrisma.group.findFirst.mockResolvedValueOnce({
      id: "g1",
      name: "Test Group",
      status: "SUSPENDED",
      packageId: "pkg1",
      packageVersionId: "pv1",
      package: { tenantId: "t1", status: "ACTIVE", maxAge: null, dependentMaxAge: null },
      packageVersion: { packageId: "pkg1", status: "ACTIVE" },
    });
    const csv = "firstName,lastName,dateOfBirth,gender,relationship\nJane,Doe,1990-01-01,FEMALE,PRINCIPAL\n";
    const inactive = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(inactive.error).toMatch(/group is suspended/i);

    mockPrisma.group.findFirst.mockResolvedValueOnce({
      id: "g1",
      name: "Test Group",
      status: "ACTIVE",
      packageId: "pkg1",
      packageVersionId: null,
      package: { tenantId: "t1", status: "ACTIVE", maxAge: null, dependentMaxAge: null },
      packageVersion: null,
    });
    const unpinned = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(unpinned.error).toMatch(/not pinned to an approved package version/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WP-B1 — server re-validation, transaction/idempotency (admin lane)
// ─────────────────────────────────────────────────────────────────────────
describe("confirmImportAction — server re-validation (WP-B1)", () => {
  it("REJECTS a tampered payload whose invalid row was posted without an error flag", async () => {
    const previewRows = [row()];
    const request = confirmFd(previewRows);
    // The token authenticates the valid preview. Changing a field afterwards
    // must fail before the server even considers the browser's verdict flag.
    request.set("rows", JSON.stringify([row({ gender: "HACKED" })]));
    const res = await confirmImportAction(null, request);
    expect(res.imported).toBe(0);
    expect(res.error).toMatch(/preview no longer matches/i);
    expect(createMember).not.toHaveBeenCalled();
    expect(job.reserve).not.toHaveBeenCalled();
    expect(job.claim).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled(); // no success audit on a refused import
  });

  it("REJECTS a tampered row missing a required field (lastName)", async () => {
    const res = await confirmImportAction(null, confirmFd([row({ lastName: "" })]));
    expect(res.imported).toBe(0);
    expect(createMember).not.toHaveBeenCalled();
  });

  it("never 500s on a malformed rows payload", async () => {
    const f = new FormData();
    f.set("groupId", "g1");
    f.set("rows", "{ not json");
    const res = await confirmImportAction(null, f);
    expect(res.error).toMatch(/could not be read/i);
    expect(createMember).not.toHaveBeenCalled();
  });

  it("refuses when there are zero valid rows and writes NO success audit", async () => {
    const res = await confirmImportAction(null, confirmFd([row({ gender: "X" }), row({ row: 3, firstName: "" })]));
    expect(res.error).toMatch(/no valid rows/i);
    expect(writeAudit).not.toHaveBeenCalled();
    expect(job.reserve).toHaveBeenCalledTimes(1);
    expect(job.claim).not.toHaveBeenCalled();
  });

  it("imports a valid principal and records a batch + success audit", async () => {
    const res = await confirmImportAction(null, confirmFd([row({ idNumber: "ID1" })]));
    expect(res.imported).toBe(1);
    expect(createMember).toHaveBeenCalledTimes(1);
    expect(job.reserve).toHaveBeenCalledTimes(1);
    expect(job.finalize).toHaveBeenCalledWith(mockPrisma, "batch1");
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });
});

describe("confirmImportAction — idempotency (WP-B1 / B-011)", () => {
  it("same file re-import is a deterministic no-op", async () => {
    job.reserve.mockResolvedValue({ created: false, job: { id: "b0", batchRef: "IMP-OLD", status: "PARTIAL", imported: 4, failed: [{ row: 9, name: "X Y", error: "dupe" }], terminal: true } });
    const res = await confirmImportAction(null, confirmFd([row({ idNumber: "ID1" })]));
    expect(res.alreadyImported).toBe(true);
    expect(res.imported).toBe(4);
    expect(res.failed).toHaveLength(1);
    expect(createMember).not.toHaveBeenCalled();
    expect(job.claim).not.toHaveBeenCalled();
  });

  it("a concurrent identical confirm loses the reservation race and returns the winner's result", async () => {
    job.reserve.mockResolvedValue({ created: false, job: { id: "bWin", batchRef: "IMP-WIN", status: "SUCCEEDED", imported: 2, failed: [], terminal: true } });
    const res = await confirmImportAction(null, confirmFd([row({ idNumber: "ID1" })]));
    expect(res.alreadyImported).toBe(true);
    expect(res.imported).toBe(2);
    expect(createMember).not.toHaveBeenCalled();
  });

  it("never reports a nonterminal reservation as already imported", async () => {
    job.reserve.mockResolvedValue({ created: false, job: {
      id: "bLive", batchRef: "IMP-LIVE", status: "PROCESSING",
      imported: 0, failed: [], terminal: false,
    } });
    const res = await confirmImportAction(null, confirmFd([row({ idNumber: "ID1" })]));
    expect(res.alreadyImported).toBeUndefined();
    expect(res).toMatchObject({ batchRef: "IMP-LIVE", status: "PROCESSING" });
    expect(res.error).toMatch(/outcome is not being replayed as complete/i);
    expect(createMember).not.toHaveBeenCalled();
  });

  it("replays the first result even though that import's national ID now exists", async () => {
    mockPrisma.member.findMany.mockResolvedValue([
      {
        nationalIdNormalized: "ID1",
        phoneNormalized: null,
        emailNormalized: null,
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: new Date("1990-01-01T00:00:00Z"),
      },
    ]);
    job.reserve.mockResolvedValue({ created: false, job: { id: "b0", batchRef: "IMP-OLD", status: "SUCCEEDED", imported: 1, failed: [], terminal: true } });
    const res = await confirmImportAction(null, confirmFd([row({ idNumber: "ID1" })]));
    expect(res).toMatchObject({ alreadyImported: true, imported: 1, batchId: "b0" });
    expect(createMember).not.toHaveBeenCalled();
  });

  it("labels a new database rejection as a stale preflight conflict", async () => {
    const csv = "firstName,lastName,idNumber,dateOfBirth,gender,relationship\nJane,Doe,ID1,1990-01-01,FEMALE,PRINCIPAL\n";
    const preview = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(preview.validCount).toBe(1);

    mockPrisma.member.findMany.mockResolvedValue([
      {
        nationalIdNormalized: "ID1",
        phoneNormalized: null,
        emailNormalized: null,
        firstName: "Existing",
        lastName: "Member",
        dateOfBirth: new Date("1980-01-01T00:00:00Z"),
      },
    ]);
    const result = await confirmImportAction(null, confirmFd(preview.rows));
    expect(result.imported).toBe(0);
    expect(result.failed[0].error).toMatch(/preflight changed since preview/i);
    expect(result.failed[0].error).toMatch(/national ID is already recorded/i);
    expect(createMember).not.toHaveBeenCalled();
  });

  it("never imports a row that was rejected by the signed preview even if it is valid now", async () => {
    const previewRows = [
      row({ error: "This national ID was already recorded at preview." }),
    ];
    const result = await confirmImportAction(null, confirmFd(previewRows));
    expect(result.imported).toBe(0);
    expect(result.failed[0].error).toMatch(/now appears valid.*re-upload/i);
    expect(createMember).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WP-B3 — linkage scoping + dedup (admin lane)
// ─────────────────────────────────────────────────────────────────────────
describe("confirmImportAction — dependant linkage + dedup (WP-B3)", () => {
  it("links a dependant to a principal found IN THE SAME FILE", async () => {
    createMember.mockResolvedValueOnce({ member: { id: "prin-1" }, warnings: [] }); // principal
    createMember.mockResolvedValueOnce({ member: { id: "dep-1" }, warnings: [] }); // child
    const rows = [
      row({ idNumber: "P1", relationship: "PRINCIPAL" }),
      row({ row: 3, firstName: "Kid", relationship: "CHILD", principalIdNumber: "P1", dateOfBirth: "2015-01-01" }),
    ];
    const res = await confirmImportAction(null, confirmFd(rows));
    expect(res.imported).toBe(2);
    expect(createMember).toHaveBeenCalledTimes(2);
    expect(createMember.mock.calls[1][1]).toMatchObject({ principalId: "prin-1" });
    // In-file hit means the DB fallback is not consulted.
    expect(mockPrisma.member.findFirst).not.toHaveBeenCalled();
  });

  it("scopes the DB principal fallback lookup to the import's GROUP", async () => {
    mockPrisma.member.findMany.mockImplementation(async (args: MockDbArgs) =>
      args?.where?.relationship === "PRINCIPAL"
        ? [{ nationalIdNormalized: "DBPRIN", status: "ACTIVE" }]
        : [],
    );
    mockPrisma.member.findFirst.mockResolvedValue({ id: "db-prin" });
    const rows = [row({ firstName: "Kid", relationship: "CHILD", principalIdNumber: "DBPRIN", dateOfBirth: "2015-01-01" })];
    const res = await confirmImportAction(null, confirmFd(rows));
    expect(res.imported).toBe(1);
    expect(mockPrisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: "t1", groupId: "g1", relationship: "PRINCIPAL" }) }),
    );
    expect(createMember.mock.calls[0][1]).toMatchObject({ principalId: "db-prin" });
  });

  it("FAILS a dependant with an unknown principal (no silent orphan, not counted imported)", async () => {
    mockPrisma.member.findFirst.mockResolvedValue(null);
    const rows = [row({ firstName: "Kid", relationship: "CHILD", principalIdNumber: "GHOST", dateOfBirth: "2015-01-01" })];
    const res = await confirmImportAction(null, confirmFd(rows));
    expect(res.imported).toBe(0);
    expect(res.failed[0].error).toMatch(/principal national id was not found in this group/i);
    expect(createMember).not.toHaveBeenCalled();
  });

  it("catches within-file duplicates with a row-level reason", async () => {
    const rows = [
      row({ idNumber: "DUP", relationship: "PRINCIPAL" }),
      row({ row: 3, idNumber: "DUP", relationship: "PRINCIPAL", firstName: "Twin" }),
    ];
    const res = await confirmImportAction(null, confirmFd(rows));
    expect(res.imported).toBe(1);
    expect(createMember).toHaveBeenCalledTimes(1);
    expect(res.failed.some(f => /duplicate of an earlier row/i.test(f.error))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WP-B4 — HR lane: sequential END numbering + safety
// ─────────────────────────────────────────────────────────────────────────
describe("confirmHRImportAction — endorsement numbering (WP-B4)", () => {
  function hrFd(rows: Row[], extra: Record<string, string> = {}): FormData {
    const f = new FormData();
    f.set("rows", JSON.stringify(rows));
    f.set("preflightDate", PREFLIGHT_DATE);
    f.set("preflightToken", createMemberImportPreviewToken({
      lane: "HR_ENDORSEMENT",
      tenantId: "t1",
      groupId: "g-hr",
      effectiveDate: PREFLIGHT_DATE,
      rows,
    }));
    Object.entries(extra).forEach(([k, v]) => f.set(k, v));
    return f;
  }

  it("mints SEQUENTIAL, UNIQUE END-YYYY-NNNNN numbers (never REQ-random)", async () => {
    const rows = [
      row({ firstName: "A", idNumber: "A1" }),
      row({ row: 3, firstName: "B", idNumber: "B1" }),
      row({ row: 4, firstName: "C", idNumber: "C1" }),
    ];
    const res = await confirmHRImportAction(null, hrFd(rows));
    expect(res.imported).toBe(3);
    const numbers = mockPrisma.endorsement.create.mock.calls.map(c => c[0].data.endorsementNumber);
    expect(numbers).toEqual([`END-${YEAR}-00001`, `END-${YEAR}-00002`, `END-${YEAR}-00003`]);
    expect(numbers.every(n => n.startsWith("END-"))).toBe(true);
    expect(numbers.some(n => n.startsWith("REQ-"))).toBe(false);
    expect(mockPrisma.endorsement.create.mock.calls[0][0].data.changeDetails.sourceReference).toBe(
      "HR-BULK-2026-001",
    );
  });

  it("continues the sequence past the existing numeric maximum", async () => {
    mockPrisma.endorsement.findMany.mockResolvedValue([{ endorsementNumber: `END-${YEAR}-00041` }]);
    const res = await confirmHRImportAction(null, hrFd([row({ firstName: "A", idNumber: "A1" })]));
    expect(res.imported).toBe(1);
    expect(mockPrisma.endorsement.create.mock.calls[0][0].data.endorsementNumber).toBe(`END-${YEAR}-00042`);
  });

  it("advances past a number a concurrent writer already took (P2002 backstop)", async () => {
    mockPrisma.endorsement.create
      .mockRejectedValueOnce({ code: "P2002" }) // 00001 taken
      .mockResolvedValueOnce({}); // 00002 succeeds
    const res = await confirmHRImportAction(null, hrFd([row({ firstName: "A", idNumber: "A1" })]));
    expect(res.imported).toBe(1);
    const numbers = mockPrisma.endorsement.create.mock.calls.map(c => c[0].data.endorsementNumber);
    expect(numbers).toEqual([`END-${YEAR}-00001`, `END-${YEAR}-00002`]);
  });

  it("re-validates server-side and rejects a tampered invalid row", async () => {
    const res = await confirmHRImportAction(null, hrFd([row({ gender: "HACKED" })]));
    expect(res.imported).toBe(0);
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("refuses a row with no source evidence before creating an unapprovable endorsement", async () => {
    const res = await confirmHRImportAction(
      null,
      hrFd([row({ sourceReference: "" })]),
    );
    expect(res.imported).toBe(0);
    expect(res.failed[0].error).toMatch(/source.*reference is required/i);
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
  });

  it("fails an over-age row without creating an endorsement", async () => {
    checkEnrolmentAge.mockReturnValueOnce({ ok: false, reason: "Principal exceeds the maximum age" });
    const res = await confirmHRImportAction(null, hrFd([row({ idNumber: "A1" })]));
    expect(res.imported).toBe(0);
    expect(res.failed[0].error).toMatch(/maximum age/i);
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
  });

  it("is idempotent — resubmitting the same file is a no-op", async () => {
    job.reserve.mockResolvedValue({ created: false, job: { id: "b0", batchRef: "IMP-OLD", status: "SUCCEEDED", imported: 7, failed: [], terminal: true } });
    const res = await confirmHRImportAction(null, hrFd([row({ idNumber: "A1" })]));
    expect(res.alreadyImported).toBe(true);
    expect(res.imported).toBe(7);
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
  });

  it("parses with the same guards as the admin lane (empty file)", async () => {
    const res = await parseHRImportAction(null, parseFd(csvFile("")));
    expect(res.error).toMatch(/no file uploaded/i);
  });
});
