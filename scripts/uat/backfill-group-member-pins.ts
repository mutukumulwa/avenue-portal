/**
 * Backfill `Group.packageVersionId` / `Member.packageVersionId` pins (F-PIN-2,
 * plan §6.1 / §7.1). Today only quotation-binding pinned groups; binding &
 * quotation-accept groups were created with a NULL pin, and SP-6 fails CLOSED on a
 * null member pin (NOT_YET_ENROLLED) while cost-share / usage fail OPEN. WP-3.5E
 * makes every create path set the pin going forward — this script fixes the rows
 * that already exist.
 *
 * What it does (idempotent):
 *   1. pins each NULL-pin Group to its package's `currentVersionId`;
 *   2. cascades to members with a NULL pin — set to their group's pin (the value the
 *      group has, or would get from step 1).
 * A group whose package has NO current version is reported as UNPINNABLE and left
 * untouched (needs a package-version fix first, not a blind pin).
 *
 * DRY-RUN by default (reports the NULL-pin groups + members, writes nothing); pass
 * APPLY=1 to write. Never point this at a DB you have not intended to change.
 *
 *   # dry run (reports null-pin groups)
 *   DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/backfill-group-member-pins.ts
 *   # apply
 *   APPLY=1 DATABASE_URL=postgres://…5432/db npx tsx scripts/uat/backfill-group-member-pins.ts
 */

/** Minimal Prisma surface this backfill needs — keeps the core unit-testable. */
export type PinsDb = {
  group: {
    findMany(args: unknown): Promise<
      Array<{ id: string; name: string; packageId: string; package: { currentVersionId: string | null } | null }>
    >;
    update(args: { where: { id: string }; data: { packageVersionId: string } }): Promise<unknown>;
  };
  member: {
    findMany(args: unknown): Promise<
      Array<{
        id: string;
        memberNumber: string;
        groupId: string;
        group: { packageVersionId: string | null; package: { currentVersionId: string | null } | null } | null;
      }>
    >;
    update(args: { where: { id: string }; data: { packageVersionId: string } }): Promise<unknown>;
  };
};

export type PinsReport = {
  nullPinGroups: number;
  pinnableGroups: number;
  unpinnableGroups: number;
  nullPinMembers: number;
  memberFixable: number;
  memberStuck: number;
  /** The NULL-pin groups the dry-run reports, with the version each would receive. */
  groups: Array<{ id: string; name: string; packageId: string; target: string | null }>;
};

/**
 * Core backfill — pure but for the writes it performs when `apply` is true.
 * Returns a report of what it found (and, in dry-run, would change).
 */
export async function backfillGroupMemberPins(
  db: PinsDb,
  opts: { apply: boolean; log?: (msg: string) => void } = { apply: false },
): Promise<PinsReport> {
  const log = opts.log ?? (() => {});
  log(opts.apply ? "MODE: APPLY (writing)\n" : "MODE: DRY-RUN (no writes)\n");

  // ── 1. Groups with a NULL pin ───────────────────────────────────────────────
  const nullPinGroups = await db.group.findMany({
    where: { packageVersionId: null },
    select: {
      id: true,
      name: true,
      packageId: true,
      package: { select: { currentVersionId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = nullPinGroups.map((g) => ({
    id: g.id,
    name: g.name,
    packageId: g.packageId,
    target: g.package?.currentVersionId ?? null,
  }));
  const pinnable = groups.filter((g) => g.target);
  const unpinnable = groups.filter((g) => !g.target);

  log(`Groups with NULL packageVersionId: ${nullPinGroups.length}`);
  log(`  pinnable (package has a current version): ${pinnable.length}`);
  log(`  UNPINNABLE (package has NO current version — skipped): ${unpinnable.length}`);
  for (const g of groups) {
    log(`   group ${g.id}  "${g.name}"  package=${g.packageId}  -> ${g.target ?? "(none — UNPINNABLE)"}`);
    if (opts.apply && g.target) {
      await db.group.update({ where: { id: g.id }, data: { packageVersionId: g.target } });
    }
  }

  // ── 2. Members with a NULL pin → inherit the group's (resolved) pin ──────────
  // Target = the group's own pin if set, else the value the group is being pinned
  // to above (its package's current version). A member whose group is UNPINNABLE
  // stays null and is reported.
  const nullPinMembers = await db.member.findMany({
    where: { packageVersionId: null },
    select: {
      id: true,
      memberNumber: true,
      groupId: true,
      group: {
        select: {
          packageVersionId: true,
          package: { select: { currentVersionId: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let memberFixable = 0;
  let memberStuck = 0;
  for (const m of nullPinMembers) {
    const target = m.group?.packageVersionId ?? m.group?.package?.currentVersionId ?? null;
    if (!target) {
      memberStuck++;
      continue;
    }
    memberFixable++;
    log(`   member ${m.id}  ${m.memberNumber}  group=${m.groupId}  -> ${target}`);
    if (opts.apply) {
      await db.member.update({ where: { id: m.id }, data: { packageVersionId: target } });
    }
  }

  log(`\nMembers with NULL packageVersionId: ${nullPinMembers.length}`);
  log(`  fixable (group resolves to a version): ${memberFixable}`);
  log(`  STUCK (group UNPINNABLE — left null): ${memberStuck}`);

  if (!opts.apply && (pinnable.length > 0 || memberFixable > 0)) {
    log("\nDRY-RUN complete. Re-run with APPLY=1 to write these pins.");
  } else if (opts.apply) {
    log(`\nBackfill complete: ${pinnable.length} group(s) + ${memberFixable} member(s) pinned.`);
  } else {
    log("\nNothing to backfill.");
  }
  if (unpinnable.length > 0 || memberStuck > 0) {
    log(
      `\nWARNING: ${unpinnable.length} group(s) / ${memberStuck} member(s) could not be pinned ` +
        "because their package has no current version. Fix the package version, then re-run.",
    );
  }

  return {
    nullPinGroups: nullPinGroups.length,
    pinnableGroups: pinnable.length,
    unpinnableGroups: unpinnable.length,
    nullPinMembers: nullPinMembers.length,
    memberFixable,
    memberStuck,
    groups,
  };
}

// ── CLI entry (only when run directly; keeps the DB deps out of the test path) ──
async function cli() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const apply = process.env.APPLY === "1";

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    await backfillGroupMemberPins(prisma as unknown as PinsDb, { apply, log: (m) => console.log(m) });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (process.argv[1] && /backfill-group-member-pins\.(ts|js|mjs)$/.test(process.argv[1])) {
  cli().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
