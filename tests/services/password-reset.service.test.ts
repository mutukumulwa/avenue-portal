import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), update: vi.fn(async () => ({})) },
  passwordResetToken: {
    updateMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async () => ({ id: "tok1" })),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));
const enqueueEmail = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/queue", () => ({ enqueueEmail }));

import { PasswordResetService } from "@/server/services/password-reset.service";

describe("PasswordResetService (R24 / H-02)", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("request", () => {
    it("issues + emails a code for an active user", async () => {
      db.user.findFirst.mockResolvedValue({ id: "u1", firstName: "Grace" });
      await PasswordResetService.request("grace@medvex.co.ug");
      expect(db.passwordResetToken.create).toHaveBeenCalled();
      expect(enqueueEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "grace@medvex.co.ug", subject: expect.stringMatching(/reset code/i) }),
      );
    });

    it("is silent for an unknown email (no leak)", async () => {
      db.user.findFirst.mockResolvedValue(null);
      await PasswordResetService.request("nobody@example.com");
      expect(db.passwordResetToken.create).not.toHaveBeenCalled();
      expect(enqueueEmail).not.toHaveBeenCalled();
    });
  });

  describe("confirm", () => {
    it("rejects a non-policy-compliant new password before touching tokens", async () => {
      const err = await PasswordResetService.confirm("g@medvex.co.ug", "123456", "weak");
      expect(err).toMatch(/at least/);
      expect(db.passwordResetToken.findFirst).not.toHaveBeenCalled();
    });

    it("rejects a wrong code", async () => {
      db.user.findFirst.mockResolvedValue({ id: "u1" });
      db.passwordResetToken.findFirst.mockResolvedValue({ id: "t1", codeHash: await bcrypt.hash("111111", 10) });
      const err = await PasswordResetService.confirm("g@medvex.co.ug", "999999", "Medvex2026x");
      expect(err).toMatch(/invalid or expired/i);
      expect(db.user.update).not.toHaveBeenCalled();
    });

    it("sets the new password on a correct code", async () => {
      db.user.findFirst.mockResolvedValue({ id: "u1" });
      db.passwordResetToken.findFirst.mockResolvedValue({ id: "t1", codeHash: await bcrypt.hash("424242", 10) });
      const err = await PasswordResetService.confirm("g@medvex.co.ug", "424242", "Medvex2026x");
      expect(err).toBeNull();
      expect(db.user.update).toHaveBeenCalled();
      expect(db.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
      );
    });
  });
});
