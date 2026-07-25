/**
 * F5.14 — provider-safe reconsideration timeline (pure). Proves "the provider sees only shared
 * state": internal reviewer events (TRIAGED / ASSIGNED / UNDER_REVIEW / INTERNAL_NOTE) are
 * dropped entirely, message text is surfaced ONLY for the info exchange, and no internal field
 * (internalReasonRef / actor / metadata) can travel through the projection.
 */
import { describe, it, expect } from "vitest";
import {
  toProviderReconsiderationTimeline,
  PROVIDER_VISIBLE_RECONSIDERATION_EVENTS,
} from "@/server/services/claim-reconsideration/policy";

const at = (n: number) => new Date(Date.UTC(2026, 6, n));

const events = [
  { eventType: "SUBMITTED", message: null, createdAt: at(1), internalReasonRef: null },
  { eventType: "TRIAGED", message: null, createdAt: at(2), internalReasonRef: null },
  { eventType: "ASSIGNED", message: null, createdAt: at(3), internalReasonRef: "user_reviewer_7" },
  { eventType: "INFO_REQUESTED", message: "Please attach the itemized invoice.", createdAt: at(4), internalReasonRef: null },
  { eventType: "INTERNAL_NOTE", message: "Suspect upcoding — verify against the fee schedule.", createdAt: at(5), internalReasonRef: "note_12" },
  { eventType: "PROVIDER_RESPONDED", message: "Invoice attached: INV-42.", createdAt: at(6), internalReasonRef: null },
  { eventType: "UPHELD", message: null, createdAt: at(7), internalReasonRef: null },
];

describe("F5.14 toProviderReconsiderationTimeline", () => {
  it("drops every internal reviewer event and keeps only the shared ones", () => {
    const types = toProviderReconsiderationTimeline(events).map((e) => e.type);
    expect(types).toEqual(["SUBMITTED", "INFO_REQUESTED", "PROVIDER_RESPONDED", "UPHELD"]);
    for (const hidden of ["TRIAGED", "ASSIGNED", "UNDER_REVIEW", "INTERNAL_NOTE"]) {
      expect(types).not.toContain(hidden);
      expect(PROVIDER_VISIBLE_RECONSIDERATION_EVENTS.has(hidden)).toBe(false);
    }
  });

  it("surfaces message text ONLY for the info-request / provider-response exchange", () => {
    const t = toProviderReconsiderationTimeline(events);
    expect(t.find((e) => e.type === "INFO_REQUESTED")!.message).toBe("Please attach the itemized invoice.");
    expect(t.find((e) => e.type === "PROVIDER_RESPONDED")!.message).toBe("Invoice attached: INV-42.");
    // Non-exchange shared events carry no message even if one existed.
    expect(t.find((e) => e.type === "SUBMITTED")!.message).toBeNull();
    expect(t.find((e) => e.type === "UPHELD")!.message).toBeNull();
  });

  it("never leaks an internal note's text or any internal ref through the projection", () => {
    const serialized = JSON.stringify(toProviderReconsiderationTimeline(events));
    expect(serialized).not.toMatch(/upcoding|fee schedule/i); // the internal note body
    expect(serialized).not.toMatch(/user_reviewer_7|note_12/); // internalReasonRef pointers
    // The entry shape carries only { at, type, message } — no internal field is even representable.
    for (const entry of toProviderReconsiderationTimeline(events)) {
      expect(Object.keys(entry).sort()).toEqual(["at", "message", "type"]);
    }
  });

  it("is order-preserving and safe on an empty log", () => {
    expect(toProviderReconsiderationTimeline([])).toEqual([]);
    const times = toProviderReconsiderationTimeline(events).map((e) => e.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
