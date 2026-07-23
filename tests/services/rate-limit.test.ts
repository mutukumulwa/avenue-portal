/** F6.1 — sliding-window limiter. */
import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, resetRateLimiter } from "@/lib/rate-limit";

describe("rateLimit (F6.1)", () => {
  beforeEach(() => resetRateLimiter());

  it("allows up to the limit inside a window, then blocks with retry-after", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i += 1) expect(rateLimit("k", 5, 60_000, t0 + i).allowed).toBe(true);
    const blocked = rateLimit("k", 5, 60_000, t0 + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window elapses and isolates keys", () => {
    const t0 = 2_000_000;
    expect(rateLimit("a", 1, 1_000, t0).allowed).toBe(true);
    expect(rateLimit("a", 1, 1_000, t0 + 10).allowed).toBe(false);
    expect(rateLimit("b", 1, 1_000, t0 + 10).allowed).toBe(true); // different key
    expect(rateLimit("a", 1, 1_000, t0 + 1_001).allowed).toBe(true); // window rolled
  });
});
