import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  group: { findFirst: vi.fn(), findUnique: vi.fn() },
  member: { findFirst: vi.fn() },
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

import { parseImportAction, confirmImportAction } from "@/app/(admin)/members/import/actions";
import { parseHRImportAction, confirmHRImportAction } from "@/app/(hr)/hr/roster/import/actions";

const YEAR = new Date().getFullYear();

type Row = {
  row: number; firstName: string; lastName: string; idNumber: string;
  dateOfBirth: string; gender: string; phone: string; email: string;
  relationship: string; principalIdNumber: string; error?: string;
};

function row(partial: Partial<Row> = {}): Row {
  return {
    row: 2, firstName: "John", lastName: "Doe", idNumber: "", dateOfBirth: "1990-01-01",
    gender: "MALE", phone: "", email: "", relationship: "PRINCIPAL", principalIdNumber: "",
    ...partial,
  };
}

function confirmFd(rows: Row[], extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  f.set("groupId", "g1");
  f.set("rows", JSON.stringify(rows));
  Object.entries(extra).forEach(([k, v]) => f.set(k, v));
  return f;
}

function csvFile(content: string, name = "members.csv", type = "text/csv"): File {
  return new File([content], name, { type });
}
function parseFd(file: File): FormData {
  const f = new FormData();
  f.set("file", file);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.group.findFirst.mockResolvedValue({ id: "g1", name: "Test Group" });
  mockPrisma.group.findUnique.mockResolvedValue({ packageId: "pkg1" });
  mockPrisma.package.findUnique.mockResolvedValue({ maxAge: null, dependentMaxAge: null });
  mockPrisma.member.findFirst.mockResolvedValue(null);
  mockPrisma.importBatch.findUnique.mockResolvedValue(null);
  mockPrisma.importBatch.create.mockResolvedValue({ id: "batch1" });
  mockPrisma.importBatch.update.mockResolvedValue({});
  mockPrisma.endorsement.findMany.mockResolvedValue([]);
  mockPrisma.endorsement.create.mockResolvedValue({});
  createMember.mockResolvedValue({ member: { id: "created-1" }, warnings: [] });
  checkEnrolmentAge.mockReturnValue({ ok: true });
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
    expect(res.rows[0].error).toMatch(/gender must be/i);
  });

  it("neutralizes a CSV formula-injection name on ingest", async () => {
    const csv = "firstName,lastName,dateOfBirth,gender,relationship\n=HYPERLINK(\"http://x\"),Doe,1990-01-01,MALE,PRINCIPAL\n";
    const res = await parseImportAction(null, parseFd(csvFile(csv)));
    expect(res.rows[0].firstName.startsWith("'=")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WP-B1 — server re-validation, transaction/idempotency (admin lane)
// ─────────────────────────────────────────────────────────────────────────
describe("confirmImportAction — server re-validation (WP-B1)", () => {
  it("REJECTS a tampered payload whose invalid row was posted without an error flag", async () => {
    // gender is invalid but the client stripped `error` — the server must re-derive it.
    const res = await confirmImportAction(null, confirmFd([row({ gender: "HACKED" })]));
    expect(res.imported).toBe(0);
    expect(res.failed).toHaveLength(1);
    expect(createMember).not.toHaveBeenCalled();
    expect(mockPrisma.importBatch.create).not.toHaveBeenCalled();
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
    expect(mockPrisma.importBatch.create).not.toHaveBeenCalled();
  });

  it("imports a valid principal and records a batch + success audit", async () => {
    const res = await confirmImportAction(null, confirmFd([row({ idNumber: "ID1" })]));
    expect(res.imported).toBe(1);
    expect(createMember).toHaveBeenCalledTimes(1);
    expect(mockPrisma.importBatch.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.importBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ importedCount: 1 }) }),
    );
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });
});

describe("confirmImportAction — idempotency (WP-B1 / B-011)", () => {
  it("same file re-import is a deterministic no-op", async () => {
    mockPrisma.importBatch.findUnique.mockResolvedValue({ id: "b0", importedCount: 4, rejects: [{ row: 9, name: "X Y", error: "dupe" }] });
    const res = await confirmImportAction(null, confirmFd([row({ idNumber: "ID1" })]));
    expect(res.alreadyImported).toBe(true);
    expect(res.imported).toBe(4);
    expect(res.failed).toHaveLength(1);
    expect(createMember).not.toHaveBeenCalled();
    expect(mockPrisma.importBatch.create).not.toHaveBeenCalled();
  });

  it("a concurrent identical confirm loses the reservation race and returns the winner's result", async () => {
    mockPrisma.importBatch.create.mockRejectedValue({ code: "P2002" });
    mockPrisma.importBatch.findUnique
      .mockResolvedValueOnce(null) // initial check: not yet present
      .mockResolvedValueOnce({ id: "bWin", importedCount: 2, rejects: [] }); // after P2002
    const res = await confirmImportAction(null, confirmFd([row({ idNumber: "ID1" })]));
    expect(res.alreadyImported).toBe(true);
    expect(res.imported).toBe(2);
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
    expect(res.failed[0].error).toMatch(/principal with national id "GHOST" was not found in this group/i);
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

  it("fails an over-age row without creating an endorsement", async () => {
    checkEnrolmentAge.mockReturnValueOnce({ ok: false, reason: "Principal exceeds the maximum age" });
    const res = await confirmHRImportAction(null, hrFd([row({ idNumber: "A1" })]));
    expect(res.imported).toBe(0);
    expect(res.failed[0].error).toMatch(/maximum age/i);
    expect(mockPrisma.endorsement.create).not.toHaveBeenCalled();
  });

  it("is idempotent — resubmitting the same file is a no-op", async () => {
    mockPrisma.importBatch.findUnique.mockResolvedValue({ id: "b0", importedCount: 7, rejects: [] });
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
