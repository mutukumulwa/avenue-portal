import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { enqueueEmail } from "@/lib/queue";
import { validatePassword } from "@/lib/password-policy";

/**
 * Password reset via emailed one-time code (Medvex spec §6 / R24 / gap H-02).
 * Codes are 6 digits, single-use, expire in 15 minutes, and are stored only as
 * a bcrypt hash. Requests never reveal whether an email exists.
 */
const CODE_TTL_MINUTES = 15;

export class PasswordResetService {
  /** Issue a reset code to the user's email (silent if no such active user). */
  static async request(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: normalized, isActive: true },
      select: { id: true, firstName: true },
    });
    if (!user) return; // do not leak existence

    // Invalidate any outstanding codes, then issue a fresh one.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = await bcrypt.hash(code, 10);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    });

    await enqueueEmail({
      to: normalized,
      subject: "Your Medvex password reset code",
      body:
        `Hi ${user.firstName},\n\nYour Medvex password reset code is ${code}. ` +
        `It expires in ${CODE_TTL_MINUTES} minutes. If you did not request this, ignore this email.`,
    });
  }

  /**
   * Confirm a reset: verify the code and set a new (policy-compliant) password.
   * Returns null on success, or an error message.
   */
  static async confirm(email: string, code: string, newPassword: string): Promise<string | null> {
    const pwError = validatePassword(newPassword);
    if (pwError) return pwError;

    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: normalized, isActive: true },
      select: { id: true },
    });
    if (!user) return "Invalid code or email.";

    const token = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!token) return "Invalid or expired code.";

    const ok = await bcrypt.compare(code, token.codeHash);
    if (!ok) return "Invalid or expired code.";

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(newPassword, 12) },
      }),
      prisma.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return null;
  }
}
