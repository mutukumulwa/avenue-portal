/**
 * F9.7 — SSRF-safe outbound fetch (pure; injected resolver + fetcher, no network).
 * Runtime DNS-rebind protection, HTTPS/allowlist form checks, redirect refusal,
 * timeout, and a response body cap.
 */
import { describe, it, expect } from "vitest";
import { resolveAndAssertPublic, safeFetchText, type SafeFetchResponse } from "@/lib/http-safe";
import { UrlSafetyError } from "@/lib/url-safety";

const res = (status: number, body: string, headers: Record<string, string> = {}): SafeFetchResponse => ({
  status,
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  text: async () => body,
});

const publicResolver = async () => ["8.8.8.8"];
const okFetcher = (body: string, status = 200) => async () => res(status, body);

describe("resolveAndAssertPublic", () => {
  it("passes a public resolution and rejects private/empty ones", async () => {
    await expect(resolveAndAssertPublic("hms.aku.edu", publicResolver)).resolves.toEqual(["8.8.8.8"]);
    await expect(resolveAndAssertPublic("hms.aku.edu", async () => ["10.0.0.5"])).rejects.toMatchObject({ code: "BLOCKED_HOST" });
    await expect(resolveAndAssertPublic("hms.aku.edu", async () => ["8.8.8.8", "127.0.0.1"])).rejects.toMatchObject({ code: "BLOCKED_HOST" });
    await expect(resolveAndAssertPublic("hms.aku.edu", async () => [])).rejects.toMatchObject({ code: "BLOCKED_HOST" });
  });
});

describe("safeFetchText", () => {
  it("fetches a public https endpoint that resolves to a public IP", async () => {
    const r = await safeFetchText("https://hms.aku.edu/pull", {}, { resolver: publicResolver, fetcher: okFetcher('{"entries":[]}') });
    expect(r.status).toBe(200);
    expect(r.body).toBe('{"entries":[]}');
  });

  it("blocks a host that RESOLVES to a private address (DNS rebind)", async () => {
    await expect(safeFetchText("https://hms.aku.edu/pull", {}, { resolver: async () => ["169.254.169.254"], fetcher: okFetcher("{}") }))
      .rejects.toMatchObject({ code: "BLOCKED_HOST" });
  });

  it("rejects non-https and off-allowlist before any fetch", async () => {
    let fetched = false;
    const spy = async () => {
      fetched = true;
      return res(200, "{}");
    };
    await expect(safeFetchText("http://hms.aku.edu/pull", {}, { resolver: publicResolver, fetcher: spy })).rejects.toBeInstanceOf(UrlSafetyError);
    await expect(safeFetchText("https://evil.com/pull", { allowlist: ["hms.aku.edu"] }, { resolver: publicResolver, fetcher: spy })).rejects.toMatchObject({ code: "NOT_ALLOWLISTED" });
    expect(fetched).toBe(false);
  });

  it("refuses to follow a redirect", async () => {
    await expect(safeFetchText("https://hms.aku.edu/pull", {}, { resolver: publicResolver, fetcher: okFetcher("", 302) })).rejects.toThrow(/redirect/i);
  });

  it("rejects an oversized response body", async () => {
    const big = "x".repeat(2000);
    await expect(safeFetchText("https://hms.aku.edu/pull", { maxBodyBytes: 1000 }, { resolver: publicResolver, fetcher: okFetcher(big) })).rejects.toThrow(/maximum size/i);
  });
});
