/**
 * WP-7 (DEF-005) — disposable authentication-test identities.
 *
 * The UAT could not execute A-003 (wrong password / lockout), A-005 (2FA
 * invalid and expired codes), A-006 (password reset), A-007 (logout and
 * shared-device privacy), A-008 (idle timeout) or A-009 (multi-tab isolation),
 * because doing so would have damaged the operational personas those same
 * scenarios depend on. These identities exist to be abused and thrown away.
 *
 * SAFETY
 * ------
 * - Runs ONLY when UAT_TEST_IDENTITIES=1. It is not part of normal
 *   provisioning and must never run against production.
 * - Refuses to run when NODE_ENV=production unless UAT_ALLOW_PROD=1 is also
 *   set, so an accidental env var cannot seed logins into a live tenant.
 * - The password comes from UAT_TEST_PASSWORD. There is no default: a value
 *   committed here would be a credential in the repository.
 * - `retireUatIdentities` deactivates them after a run; ownership and expiry
 *   are recorded on the account itself.
 *
 * KNOWN GAP: A-006 (password reset) additionally needs a reachable mailbox.
 * The email worker is unprovisioned, which is an infrastructure task no code
 * change here can satisfy — A-006 stays blocked until it lands.
 */
import { PrismaClient, type UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

export const UAT_IDENTITY_PREFIX = "uat-";

type UatIdentity = {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  purpose: string;
};

export const UAT_IDENTITIES: readonly UatIdentity[] = [
  {
    email: "uat-lockout@medvex.co.ug",
    firstName: "UAT",
    lastName: "Lockout",
    role: "CUSTOMER_SERVICE",
    purpose: "A-003 repeated wrong-password and throttling/lockout testing",
  },
  {
    email: "uat-reset@medvex.co.ug",
    firstName: "UAT",
    lastName: "Reset",
    role: "CUSTOMER_SERVICE",
    purpose: "A-006 password-reset delivery, use, reuse and expiry",
  },
  {
    email: "uat-totp@medvex.co.ug",
    firstName: "UAT",
    lastName: "Totp",
    role: "SUPER_ADMIN",
    purpose: "A-005 2FA happy path plus invalid and expired codes",
  },
  {
    email: "uat-session@medvex.co.ug",
    firstName: "UAT",
    lastName: "Session",
    role: "CUSTOMER_SERVICE",
    purpose: "A-007 logout/back, A-008 idle timeout, A-009 multi-tab isolation",
  },
];

function assertSafeToRun() {
  if (process.env.UAT_TEST_IDENTITIES !== "1") {
    throw new Error(
      "Refusing to seed UAT identities: set UAT_TEST_IDENTITIES=1 to opt in.",
    );
  }
  if (process.env.NODE_ENV === "production" && process.env.UAT_ALLOW_PROD !== "1") {
    throw new Error(
      "Refusing to seed UAT identities into a production environment. " +
        "These are disposable accounts intended to be locked out and reset.",
    );
  }
  if (!process.env.UAT_TEST_PASSWORD) {
    throw new Error(
      "Refusing to seed UAT identities: set UAT_TEST_PASSWORD. " +
        "No default is provided — a committed password would be a repository credential.",
    );
  }
}

/** Creates (or refreshes) the disposable identities for one tenant. */
export async function seedUatIdentities(prisma: PrismaClient, tenantId: string) {
  assertSafeToRun();

  const passwordHash = await bcrypt.hash(process.env.UAT_TEST_PASSWORD!, 10);
  const owner = process.env.UAT_OWNER ?? "unassigned — record the owner in 02 Roles & Accounts";

  for (const identity of UAT_IDENTITIES) {
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: identity.email } },
      // Reset the password and reactivate on every run: a prior run will have
      // deliberately locked or expired these accounts.
      update: { passwordHash, isActive: true },
      create: {
        tenantId,
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        role: identity.role,
        passwordHash,
        isActive: true,
      },
    });
  }

  console.log(
    `✅ UAT identities: ${UAT_IDENTITIES.length} disposable accounts (owner: ${owner}).\n` +
      "   Credentials live in the approved secret store only — never in the workbook, " +
      "screenshots, logs or this repository.",
  );
  return UAT_IDENTITIES.map((i) => i.email);
}

/** Deactivates the disposable identities after a run. Audit history is preserved. */
export async function retireUatIdentities(prisma: PrismaClient, tenantId: string) {
  const { count } = await prisma.user.updateMany({
    where: { tenantId, email: { startsWith: UAT_IDENTITY_PREFIX } },
    data: { isActive: false },
  });
  console.log(`✅ Retired ${count} UAT identities (deactivated, not deleted).`);
  return count;
}
