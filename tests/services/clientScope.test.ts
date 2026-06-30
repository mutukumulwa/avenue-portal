import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  clientFilter,
  assertClientAccess,
  resolveWriteClientId,
} from "@/server/trpc/clientScope";

// Multi-client isolation primitives (G2.1). These encode the hard cross-client
// security boundary, so they get explicit coverage.
describe("clientScope — multi-client isolation (G2.1)", () => {
  const confined = { tenantId: "t1", clientId: "c1" };
  const operator = { tenantId: "t1" }; // clientId undefined => spans all clients

  describe("clientFilter", () => {
    it("confines reads to the caller's client when confined", () => {
      expect(clientFilter(confined)).toEqual({ clientId: "c1" });
    });
    it("spans all clients (empty filter) for operator-level users", () => {
      expect(clientFilter(operator)).toEqual({});
    });
  });

  describe("assertClientAccess", () => {
    it("allows a confined user to reach their own client's resource", () => {
      expect(() => assertClientAccess(confined, "c1")).not.toThrow();
    });
    it("denies a confined user reaching another client's resource", () => {
      expect(() => assertClientAccess(confined, "c2")).toThrow(TRPCError);
    });
    it("allows operator-level users to reach any client", () => {
      expect(() => assertClientAccess(operator, "c2")).not.toThrow();
    });
    it("treats not-yet-backfilled (null/undefined) rows as accessible", () => {
      expect(() => assertClientAccess(confined, null)).not.toThrow();
      expect(() => assertClientAccess(confined, undefined)).not.toThrow();
    });
  });

  describe("resolveWriteClientId", () => {
    it("returns the confined user's own client", () => {
      expect(resolveWriteClientId(confined)).toBe("c1");
    });
    it("ignores a matching explicit selection for a confined user", () => {
      expect(resolveWriteClientId(confined, "c1")).toBe("c1");
    });
    it("rejects a confined user writing to a different client", () => {
      expect(() => resolveWriteClientId(confined, "c2")).toThrow(TRPCError);
    });
    it("returns the explicit selection for an operator user", () => {
      expect(resolveWriteClientId(operator, "c2")).toBe("c2");
    });
    it("rejects an operator write with no client selected", () => {
      expect(() => resolveWriteClientId(operator)).toThrow(TRPCError);
    });
  });
});
