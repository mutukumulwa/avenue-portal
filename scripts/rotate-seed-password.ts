/**
 * rotate-seed-password.ts (PR-003)
 *
 * The original seed password was rendered on the public /login page and must be
 * treated as burned in every environment that ever served that page. This
 * script rotates the password hash of all seeded (or all, with --all-users)
 * accounts to a new value.
 *
 * Usage:
 *   NEW_PASSWORD='<new value>' npx tsx scripts/rotate-seed-password.ts
 *   NEW_PASSWORD='<new value>' npx tsx scripts/rotate-seed-password.ts --all-users
 *
 * Without --all-users only accounts on the seeded domains
 * (@medvex.co.ug, @kaib.co.ke, @safaricom.co.ke) are rotated.
 */
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL }));
const prisma = new PrismaClient({ adapter });

async function main() {
  const newPassword = process.env.NEW_PASSWORD;
  if (!newPassword || newPassword.length < 12) {
    console.error("Set NEW_PASSWORD (min 12 chars) in the environment. Aborting.");
    process.exit(1);
  }
  const allUsers = process.argv.includes("--all-users");
  const hash = await bcrypt.hash(newPassword, 10);

  const where = allUsers
    ? {}
    : {
        OR: [
          { email: { endsWith: "@medvex.co.ug" } },
          { email: { endsWith: "@kaib.co.ke" } },
          { email: { endsWith: "@safaricom.co.ke" } },
        ],
      };

  const result = await prisma.user.updateMany({
    where,
    data: { passwordHash: hash },
  });
  console.log(`Rotated password for ${result.count} account(s)${allUsers ? " (all users)" : " (seeded domains)"}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
