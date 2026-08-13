/**
 * UAT-HF P04.01 acceptance — "double-click, refresh, tab close, 500-before-write,
 * and response-loss-after-write tests produce zero or one write — never two —
 * and always yield a discoverable outcome."
 *
 * DEF-034: "Submitting a completed enrolment with a rapid double-click creates
 * NOTHING — the member count is unchanged and a search returns '0 of 2780
 * results' — and the user is told nothing at all."
 *
 * The register's recommended fix was to disable the button while in flight.
 * THAT WAS ALREADY IN THE TESTED BUILD (`disabled={pending}` is present in
 * 53df0ab) and the defect happened anyway — the run measured `disabled=false`
 * 120 ms after the first click. A client-side disable cannot close this race;
 * only server-side idempotency can.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.hoisted(() => vi.fn(async () => ({ user: { id: "mo-1", tenantId: "t1" } })));
vi.mock("@/lib/rbac", () => ({ requireRole, ROLES: { MEMBER_OPS: ["MEMBER_OPS"] } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));

const createMember = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/members.service", () => ({ MembersService: { createMember } }));

const receipts = vi.hoisted(() => ({
  reserve: vi.fn(),
  succeed: vi.fn(async () => ({})),
  lookup: vi.fn(),
}));
vi.mock("@/server/services/operation-receipt.service", () => ({ OperationReceiptService: receipts }));

import { addMemberAction } from "@/app/(admin)/members/new/actions";
import { OPERATION_ID_FIELD } from "@/lib/mutation-contract";

const OP = "op_11111111-2222-4333-8444-555555555555";

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    groupId: "g1",
    firstName: "Amina",
    lastName: "Nabirye Kato",
    idNumber: "CM12345678",
    dateOfBirth: "1990-01-01",
    gender: "FEMALE",
    relationship: "PRINCIPAL",
    [OPERATION_ID_FIELD]: OP,
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

const run = (fd: FormData = form()) => addMemberAction(null, fd);

beforeEach(() => {
  vi.clearAllMocks();
  createMember.mockResolvedValue({ member: { id: "m1", memberNumber: "UX26-2026-00017" }, warnings: [] });
  receipts.reserve.mockResolvedValue({ status: "RESERVED", receipt: { id: "r1" } });
});

describe("P04.01 the DEF-034 double-click", () => {
  it("first submit enrols and returns a quotable reference", async () => {
    const result = await run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(createMember).toHaveBeenCalledTimes(1);
    expect(result.entityRef).toBe("UX26-2026-00017");
    expect(result.replayed).toBe(false);
    // DEF-075: success must name a next action, not just vanish.
    expect(result.nextAction).toBe("View member");
  });

  it("the SECOND click writes nothing and reports the first result", async () => {
    // The receipt from the first click is already SUCCEEDED.
    receipts.reserve.mockResolvedValue({
      status: "REPLAY",
      receipt: { id: "r1", entityRef: "UX26-2026-00017", entityId: "m1" },
    });

    const result = await run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Never two writes.
    expect(createMember).not.toHaveBeenCalled();
    // And never the blank form the run saw: the operator is told it is done.
    expect(result.replayed).toBe(true);
    expect(result.entityRef).toBe("UX26-2026-00017");
  });

  it("a click that races an in-flight first submit does NOT write", async () => {
    receipts.reserve.mockResolvedValue({ status: "IN_PROGRESS", receipt: { id: "r1" } });
    const result = await run();
    expect(createMember).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("CONFLICT");
    expect(result.message).toMatch(/already being processed/i);
  });

  it("refuses to submit at all without a client-minted operation id", async () => {
    const fd = form();
    fd.delete(OPERATION_ID_FIELD);
    const result = await run(fd);
    // Without a key the call cannot be made idempotent, so a double-click would
    // be two real writes. Refuse rather than risk it.
    expect(createMember).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});

describe("P04.01 failures stay discoverable", () => {
  it("a 500 BEFORE the write reports a failure and creates nothing", async () => {
    createMember.mockRejectedValue(Object.assign(new Error("db down"), { code: "P1001" }));
    const result = await run();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("UNAVAILABLE");
    expect(receipts.succeed).not.toHaveBeenCalled();
  });

  it("an unrecognised failure is UNKNOWN_OUTCOME, never a confident 'it failed'", async () => {
    createMember.mockRejectedValue(new Error("something odd"));
    const result = await run();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // We cannot prove nothing was written, so we must not invite a resubmit.
    expect(result.kind).toBe("UNKNOWN_OUTCOME");
    expect(result.retryable).toBe(false);
    expect(result.operationId).toBe(OP);
  });

  it("a prior UNKNOWN attempt is never silently retried", async () => {
    receipts.reserve.mockResolvedValue({ status: "UNKNOWN_PRIOR", receipt: { id: "r1" } });
    const result = await run();
    expect(createMember).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("UNKNOWN_OUTCOME");
  });

  it("the same key with a DIFFERENT payload is a conflict, not a replay", async () => {
    receipts.reserve.mockResolvedValue({ status: "CONFLICT", receipt: { id: "r1" } });
    const result = await run();
    expect(createMember).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/reload the page/i);
  });

  it("every failure carries a quotable correlation id", async () => {
    createMember.mockRejectedValue(new Error("boom"));
    const result = await run();
    if (result.ok) throw new Error("unreachable");
    expect(result.correlationId).toMatch(/^cor_/);
  });
});

describe("P04.01 the receipt is completed with the real reference", () => {
  it("records entity type, id and the member number", async () => {
    await run();
    expect(receipts.succeed).toHaveBeenCalledWith("r1", {
      entityType: "Member",
      entityId: "m1",
      entityRef: "UX26-2026-00017",
    });
  });

  it("reserves BEFORE writing, keyed on the client's operation id", async () => {
    await run();
    const arg = receipts.reserve.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.operationType).toBe("members.create");
    expect(arg.idempotencyKey).toBe(OP);
    expect(arg.actorId).toBe("mo-1");
    expect(arg.tenantId).toBe("t1");
  });
});

describe("P05.06 validation happens before reservation", () => {
  it("refuses a malformed phone as a named field problem without reserving or writing", async () => {
    const result = await run(form({ phone: "+256 77 ABC 044" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("VALIDATION");
    expect(result.fieldErrors?.phone?.[0]).toMatch(/Ugandan phone number/i);
    expect(receipts.reserve).not.toHaveBeenCalled();
    expect(createMember).not.toHaveBeenCalled();
  });

  it("rejects forged enum and email values before reserving an operation", async () => {
    const result = await run(form({ gender: "UNKNOWN", relationship: "COUSIN", email: "bad" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.fieldErrors?.gender).toBeDefined();
    expect(result.fieldErrors?.relationship).toBeDefined();
    expect(result.fieldErrors?.email).toBeDefined();
    expect(receipts.reserve).not.toHaveBeenCalled();
    expect(createMember).not.toHaveBeenCalled();
  });

  it("passes the complete consented address through the operation hash and member service", async () => {
    await run(
      form({
        addressCountry: "Uganda",
        addressDistrict: "Wakiso",
        addressLocality: "Kira Municipality",
        addressSubcounty: "Namugongo Division",
        addressParish: "Kyaliwajjala",
        addressVillage: "Buwate",
        addressLatitude: "0.347596",
        addressLongitude: "32.582520",
        addressCoordinateConsent: "on",
      }),
    );
    const request = receipts.reserve.mock.calls[0][0].request;
    expect(request).toMatchObject({
      addressCountry: "Uganda",
      addressDistrict: "Wakiso",
      addressVillage: "Buwate",
      addressLatitude: "0.347596",
      addressLongitude: "32.582520",
      addressCoordinateConsent: true,
    });
    expect(request).not.toHaveProperty("hasCoordinateConsent");
    expect(createMember).toHaveBeenCalledWith("t1", expect.objectContaining(request));
  });

  it("returns the exact resulting newborn cover date", async () => {
    createMember.mockResolvedValue({
      member: {
        id: "m1",
        memberNumber: "UX26-2026-00017",
        coverStartDate: new Date("2026-08-01T00:00:00.000Z"),
      },
      warnings: [],
    });
    const result = await run(
      form({
        relationship: "CHILD",
        dateOfBirth: "2026-08-01",
        effectiveDate: "2026-08-13",
        birthNotificationDate: "2026-08-11",
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.coverStartDate).toBe("2026-08-01");
      expect(result.data?.newbornRuleApplied).toBe(true);
    }
  });
});
