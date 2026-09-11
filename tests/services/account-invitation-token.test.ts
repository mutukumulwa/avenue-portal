/**
 * Family Hospital UAT plan P08.01 (unit) — setup-token hash, expiry and replay,
 * without a database: only the SHA-256 of the token is ever looked up; a token
 * of the wrong shape is refused before any lookup; an expired, used, revoked,
 * suspended, already-set-up or cross-tenant row answers exactly like a missing
 * one. (The real-database suite proves the same end to end.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

const db = vi.hoisted(() => ({ accountSetupInvitation: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { AccountInvitationService, hashSetupToken, SETUP_LINK_INVALID_MESSAGE, SETUP_LINK_TTL_HOURS } from "@/server/services/account-invitation.service";

const TOKEN = "Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde"; // 43 url-safe characters
const HOUR = 60 * 60 * 1000;
const row = (over: Record<string, unknown> = {}) => ({
  id: "inv-1", tenantId: "t1", userId: "u1", providerId: null,
  expiresAt: new Date(Date.now() + HOUR), usedAt: null, revokedAt: null,
  user: { tenantId: "t1", isActive: true, mustChangePassword: true },
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("setup token", () => {
  it("is stored and looked up only as its SHA-256", async () => {
    expect(hashSetupToken(TOKEN)).toBe(createHash("sha256").update(TOKEN).digest("hex"));
    expect(hashSetupToken(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSetupToken(TOKEN)).not.toBe(hashSetupToken(`${TOKEN.slice(0, -1)}f`));
    db.accountSetupInvitation.findUnique.mockResolvedValue(row());
    expect(await AccountInvitationService.checkToken(TOKEN)).toBe(true);
    const where = db.accountSetupInvitation.findUnique.mock.calls[0][0].where;
    expect(where).toEqual({ tokenHash: hashSetupToken(TOKEN) });
    expect(JSON.stringify(db.accountSetupInvitation.findUnique.mock.calls)).not.toContain(TOKEN);
  });

  it("a token of the wrong shape is refused before any lookup", async () => {
    for (const bad of [undefined, 42, "", TOKEN.slice(1), `${TOKEN}x`, TOKEN.replace("_", "+"), `${TOKEN.slice(0, 42)}/`]) {
      expect(await AccountInvitationService.checkToken(bad)).toBe(false);
    }
    expect(db.accountSetupInvitation.findUnique).not.toHaveBeenCalled();
  });

  it("expires after its lifetime, works once, and a replaced link is dead", async () => {
    expect(SETUP_LINK_TTL_HOURS).toBe(24); // DEC-FH-05
    const cases: Array<[string, Record<string, unknown> | null]> = [
      ["unknown", null],
      ["expired a moment ago", { expiresAt: new Date(Date.now() - 1) }],
      ["already used (replay)", { usedAt: new Date() }],
      ["revoked by a newer link", { revokedAt: new Date() }],
      ["account suspended", { user: { tenantId: "t1", isActive: false, mustChangePassword: true } }],
      ["account already set up", { user: { tenantId: "t1", isActive: true, mustChangePassword: false } }],
      ["another tenant's account", { user: { tenantId: "t2", isActive: true, mustChangePassword: true } }],
    ];
    for (const [label, over] of cases) {
      db.accountSetupInvitation.findUnique.mockResolvedValueOnce(over === null ? null : row(over));
      expect(await AccountInvitationService.checkToken(TOKEN), label).toBe(false);
    }
    db.accountSetupInvitation.findUnique.mockResolvedValueOnce(row({ expiresAt: new Date(Date.now() + 60_000) }));
    expect(await AccountInvitationService.checkToken(TOKEN)).toBe(true);
  });

  it("completing with an unusable link changes nothing and says one safe thing", async () => {
    db.accountSetupInvitation.findUnique.mockResolvedValue(row({ usedAt: new Date() }));
    expect(await AccountInvitationService.completeSetup(TOKEN, "Correct-Horse-7", "Correct-Horse-7")).toEqual({ ok: false, code: "INVALID_LINK", message: SETUP_LINK_INVALID_MESSAGE });
    expect(db.accountSetupInvitation.findUnique).toHaveBeenCalledTimes(1); // looked, found it spent, wrote nothing
  });
});
