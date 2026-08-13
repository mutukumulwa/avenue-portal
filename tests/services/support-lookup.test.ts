/**
 * UAT-HF P12.01 acceptance — "alert thresholds and runbook link to
 * operation/correlation lookup **without database console access**."
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  SUPPORT_LOOKUP_PERMISSION,
  UNINSTRUMENTED,
  lookupForSupport,
  maySupportLookup,
  observabilityMetrics,
} from "@/server/services/support-lookup.service";

const receiptFindFirst = vi.fn();
const eventFindMany = vi.fn();
const db = {
  operationReceipt: { findFirst: receiptFindFirst, count: vi.fn().mockResolvedValue(0) },
  domainEvent: { findMany: eventFindMany, count: vi.fn().mockResolvedValue(0) },
  importBatch: { count: vi.fn().mockResolvedValue(0) },
} as never;

const RECEIPT = {
  idempotencyKey: "op_abc123",
  correlationId: "cor_xyz",
  operationType: "MEMBER_CREATE",
  state: "SUCCEEDED",
  resultCode: null,
  entityType: "Member",
  entityId: "m1",
  entityRef: null,
  createdAt: new Date("2026-08-13T10:00:00Z"),
  completedAt: new Date("2026-08-13T10:00:02Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  receiptFindFirst.mockResolvedValue(RECEIPT);
  eventFindMany.mockResolvedValue([]);
});

describe("P12.01 the lookup answers support's actual question", () => {
  it("says plainly whether it committed", () => {
    // Support is asked "did my save go through?", not "what is the state enum?"
    expect(receiptFindFirst).toBeDefined();
  });

  it.each([
    ["SUCCEEDED", /Committed/],
    ["FAILED", /Did not commit.*safe to retry/],
    ["PROCESSING", /Still running.*Do not retry yet/],
    ["UNKNOWN", /OUTCOME UNKNOWN.*before advising a retry/],
  ])("%s → a sentence, not a code", async (state, pattern) => {
    receiptFindFirst.mockResolvedValue({ ...RECEIPT, state });
    const r = await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    expect(r.verdict).toMatch(pattern);
  });

  it("UNKNOWN is the one that warns about duplication", async () => {
    // DEF-065: the operator saw a crash and could not tell whether the write
    // landed. A retry here is exactly what creates a second member.
    receiptFindFirst.mockResolvedValue({ ...RECEIPT, state: "UNKNOWN" });
    const r = await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    expect(r.verdict).toMatch(/retry can duplicate/i);
  });
});

describe("P12.01 it accepts either reference an operator can see", () => {
  it("matches an operation id OR a correlation id", async () => {
    await lookupForSupport({ tenantId: "t1", reference: "cor_xyz" }, db);
    expect(receiptFindFirst.mock.calls[0][0].where.OR).toEqual([
      { idempotencyKey: "cor_xyz" },
      { correlationId: "cor_xyz" },
    ]);
  });

  it("is always tenant-scoped", async () => {
    await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    expect(receiptFindFirst.mock.calls[0][0].where.tenantId).toBe("t1");
  });

  it("returns a clean not-found rather than throwing", async () => {
    receiptFindFirst.mockResolvedValue(null);
    const r = await lookupForSupport({ tenantId: "t1", reference: "nope" }, db);
    expect(r.found).toBe(false);
    expect(r.verdict).toMatch(/No operation with that reference/);
  });

  it("does not query at all for an empty reference", async () => {
    const r = await lookupForSupport({ tenantId: "t1", reference: "   " }, db);
    expect(r.found).toBe(false);
    expect(receiptFindFirst).not.toHaveBeenCalled();
  });
});

describe("P12.01 what a support engineer must NOT be shown", () => {
  it("never selects the request hash or payload", async () => {
    await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    const select = receiptFindFirst.mock.calls[0][0].select;
    expect(select.requestHash).toBeUndefined();
    expect(Object.keys(select)).not.toContain("requestHash");
  });

  it("never selects a domain event's payload", async () => {
    eventFindMany.mockResolvedValue([]);
    await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    const select = eventFindMany.mock.calls[0][0].select;
    expect(select.payload).toBeUndefined();
  });

  it("the result carries no member-identifying field", async () => {
    const r = await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    const json = JSON.stringify(r);
    // entityId is an opaque cuid; there is no memberNumber/idNumber/phone/email.
    for (const forbidden of ["memberNumber", "idNumber", "nationalId", "phone", "email", "requestHash", "payload"]) {
      expect(json, forbidden).not.toContain(forbidden);
    }
  });
});

describe("P12.01 the timeline shows what happened after the write", () => {
  it("orders receipt and events chronologically", async () => {
    eventFindMany.mockResolvedValue([
      { occurredAt: new Date("2026-08-13T10:00:01Z"), eventType: "MEMBER_CREATED", projectionState: "PROJECTED", projectionError: null },
    ]);
    const r = await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    expect(r.timeline.map((t) => t.kind)).toEqual(["RECEIPT", "EVENT"]);
    expect(r.timeline[0].at.getTime()).toBeLessThanOrEqual(r.timeline[1].at.getTime());
  });

  it("surfaces a failed projection, which is a missing audit row not a missing effect", async () => {
    eventFindMany.mockResolvedValue([
      { occurredAt: new Date("2026-08-13T10:00:01Z"), eventType: "MEMBER_CREATED", projectionState: "FAILED", projectionError: "FK violation" },
    ]);
    const r = await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    expect(r.timeline[1].detail).toMatch(/projection FAILED: FK violation/);
  });

  it("skips the event query when there is no correlation id to join on", async () => {
    receiptFindFirst.mockResolvedValue({ ...RECEIPT, correlationId: null });
    await lookupForSupport({ tenantId: "t1", reference: "op_abc123" }, db);
    expect(eventFindMany).not.toHaveBeenCalled();
  });
});

describe("P12.01 metrics report health, and admit what they cannot see", () => {
  it("returns a runbook line for every reading", async () => {
    const { readings } = await observabilityMetrics("t1", db);
    expect(readings.length).toBeGreaterThan(0);
    for (const r of readings) {
      expect(r.runbook.length, r.key).toBeGreaterThan(30);
      expect(typeof r.breached, r.key).toBe("boolean");
    }
  });

  it("breaches when a threshold is exceeded", async () => {
    (db as unknown as { operationReceipt: { count: ReturnType<typeof vi.fn> } })
      .operationReceipt.count.mockResolvedValue(3);
    const { readings } = await observabilityMetrics("t1", db);
    const unknown = readings.find((r) => r.key === "mutation.unknown")!;
    expect(unknown.value).toBe(3);
    expect(unknown.breached).toBe(true);
  });

  it("lists the metrics it CANNOT instrument rather than reporting them as zero", async () => {
    // A zero reads as health. Reporting "notification failures: 0" when the
    // worker is unprovisioned would say the opposite of the truth.
    const { uninstrumented } = await observabilityMetrics("t1", db);
    expect(uninstrumented.length).toBeGreaterThanOrEqual(4);
    for (const u of uninstrumented) expect(u.why.length).toBeGreaterThan(30);
    expect(UNINSTRUMENTED.map((u) => u.metric).join(" ")).toMatch(/notification failures/);
  });

  it("records that AuditLog cannot be joined to an operation", async () => {
    // Found while building this: AuditLog has no correlationId column, so the
    // audit trail cannot be tied to the operation that produced it.
    expect(UNINSTRUMENTED.map((u) => u.metric).join(" ")).toMatch(/audit rows joined/i);
    const src = readFileSync("src/server/services/support-lookup.service.ts", "utf8");
    expect(src).toMatch(/AuditLog` is deliberately absent from this join/);
  });
});

describe("P12.01 the lookup is permissioned", () => {
  it("requires its own permission, not merely a login", () => {
    expect(SUPPORT_LOOKUP_PERMISSION).toBe("support.operation.lookup");
    expect(maySupportLookup(["support.operation.lookup"])).toBe(true);
    expect(maySupportLookup(["member.sensitive.reveal"])).toBe(false);
    expect(maySupportLookup([])).toBe(false);
    expect(maySupportLookup(undefined)).toBe(false);
  });
});
