/**
 * Family Hospital UAT plan P05.02 step 2 — the setup link's origin comes from
 * configuration only (never a request Host header), must be https (http only
 * for localhost outside production), and is null when absent or malformed.
 */
import { describe, it, expect, afterEach } from "vitest";
import { approvedPublicOrigin } from "@/lib/public-origin";

const saved = { app: process.env.NEXT_PUBLIC_APP_URL, auth: process.env.NEXTAUTH_URL, env: process.env.NODE_ENV };
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = saved.app;
  process.env.NEXTAUTH_URL = saved.auth;
  (process.env as Record<string, string | undefined>).NODE_ENV = saved.env;
});
const set = (app?: string, auth?: string) => {
  if (app === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = app;
  if (auth === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = auth;
};

describe("approvedPublicOrigin", () => {
  it("uses NEXT_PUBLIC_APP_URL, reduced to its origin", () => {
    set("https://portal.medvex.co.ug/some/path?x=1");
    expect(approvedPublicOrigin()).toBe("https://portal.medvex.co.ug");
  });
  it("falls back to NEXTAUTH_URL", () => {
    set(undefined, "https://auth.example.test");
    expect(approvedPublicOrigin()).toBe("https://auth.example.test");
  });
  it("is null when nothing is configured or the value is malformed", () => {
    set(undefined, undefined);
    expect(approvedPublicOrigin()).toBeNull();
    set("not a url");
    expect(approvedPublicOrigin()).toBeNull();
  });
  it("refuses plain http except for localhost outside production", () => {
    set("http://portal.example.test");
    expect(approvedPublicOrigin()).toBeNull();
    set("http://localhost:3000");
    expect(approvedPublicOrigin()).toBe("http://localhost:3000");
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    expect(approvedPublicOrigin()).toBeNull();
  });
});
