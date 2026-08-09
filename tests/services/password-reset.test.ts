/**
 * DEF-003 — the password-reset request must return a bounded, terminal state
 * even when email delivery is impossible, and must never enumerate accounts.
 * confirm() invalidates other sessions and clears any lockout.
 *
 * No DB: prisma and the bounded-send helper are mocked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), update: vi.fn() },
  passwordResetToken: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  $transaction: vi.fn(),
}));
const queueMock = vi.hoisted(() => ({ sendEmailNowBounded: vi.fn() }));
const bcryptMock = vi.hoisted(() => ({
  hash: vi.fn(async () => "hashed"),
  compare: vi.fn(async () => true),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/queue", () => queueMock);
vi.mock("bcryptjs", () => ({ default: bcryptMock }));

import { PasswordResetService } from "@/server/services/password-reset.service";
import { resetRateLimiter } from "@/lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
  prismaMock.passwordResetToken.create.mockResolvedValue({ id: "tok1" });
  prismaMock.user.update.mockReturnValue({});
  prismaMock.passwordResetToken.update.mockReturnValue({});
  prismaMock.$transaction.mockResolvedValue([]);
  queueMock.sendEmailNowBounded.mockResolvedValue({ delivered: true });
});

describe("PasswordResetService.request", () => {
  it("returns normally AND still creates the token even when the send throws", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1", firstName: "Jane" });
    queueMock.sendEmailNowBounded.mockRejectedValue(new Error("smtp-down"));

    await expect(PasswordResetService.request("Jane@Example.com ")).resolves.toBeUndefined();

    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(queueMock.sendEmailNowBounded).toHaveBeenCalledTimes(1);
  });

  it("neither creates a token nor sends for an unknown email (non-enumerating)", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(PasswordResetService.request("nobody@example.com")).resolves.toBeUndefined();

    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled();
    expect(queueMock.sendEmailNowBounded).not.toHaveBeenCalled();
  });

  it("stops sending once the per-email rate limit is exceeded (D-17)", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1", firstName: "Jane" });

    for (let i = 0; i < 7; i++) {
      await PasswordResetService.request("jane@example.com");
    }
    // 5 allowed per 10-min window; the 6th and 7th are silently dropped.
    expect(queueMock.sendEmailNowBounded).toHaveBeenCalledTimes(5);
  });
});

describe("PasswordResetService.confirm", () => {
  it("on success bumps sessionVersion and clears the lockout counter", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1" });
    prismaMock.passwordResetToken.findFirst.mockResolvedValue({ id: "tok1", codeHash: "h" });
    bcryptMock.compare.mockResolvedValue(true);

    const err = await PasswordResetService.confirm("jane@example.com", "123456", "ValidPass123");

    expect(err).toBeNull();
    const data = prismaMock.user.update.mock.calls[0][0].data;
    expect(data.sessionVersion).toEqual({ increment: 1 });
    expect(data.failedLoginCount).toBe(0);
    expect(data.lockedUntil).toBeNull();
    expect(data.passwordHash).toBe("hashed");
  });

  it("rejects a bad code without touching the password", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1" });
    prismaMock.passwordResetToken.findFirst.mockResolvedValue({ id: "tok1", codeHash: "h" });
    bcryptMock.compare.mockResolvedValue(false);

    const err = await PasswordResetService.confirm("jane@example.com", "000000", "ValidPass123");

    expect(err).toBe("Invalid or expired code.");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
