/**
 * PNOS F1.2 — explicit, reviewed backfill of existing provider users to ALL of
 * their provider's current active branches (backward-compatible default scope).
 *
 * Report-only by default; --apply performs the assignments through
 * ProviderBranchAssignmentService (so validation + audit run per row).
 * Idempotent (an existing active assignment is left untouched).
 *
 * Ambiguous users are NEVER guessed (spec F1.2 step 5): a provider with zero
 * active branches, a user with no providerId, or an inactive user is reported
 * as REVIEW and skipped.
 *
 *   npx tsx scripts/pnos-backfill-branch-assignments.ts                # report
 *   npx tsx scripts/pnos-backfill-branch-assignments.ts --apply        # assign
 *   npx tsx scripts/pnos-backfill-branch-assignments.ts --tenant <id>  # scope
 */
import { prisma } from "@/lib/prisma";
import {
  ProviderBranchAssignmentService,
  ProviderBranchAssignmentError,
} from "@/server/services/provider-branch-assignment.service";

async function resolveActor(tenantId: string, fallbackUserId: string): Promise<string> {
  const admin = await prisma.user.findFirst({ where: { tenantId, role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
  return admin?.id ?? fallbackUserId;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const tIdx = process.argv.indexOf("--tenant");
  const tenantFilter = tIdx >= 0 ? process.argv[tIdx + 1] : undefined;

  const providerUsers = await prisma.user.findMany({
    where: { role: "PROVIDER_USER", ...(tenantFilter ? { tenantId: tenantFilter } : {}) },
    select: { id: true, email: true, tenantId: true, providerId: true, isActive: true },
    orderBy: [{ tenantId: "asc" }, { email: "asc" }],
  });

  const summary = { mode: apply ? "APPLY" : "REPORT", scanned: providerUsers.length, review: 0, wouldAssign: 0, assigned: 0, alreadyActive: 0 };
  const rows: string[] = [];

  // cache active branches per provider
  const branchCache = new Map<string, string[]>();
  async function activeBranchIds(providerId: string, tenantId: string): Promise<string[]> {
    const key = `${tenantId}:${providerId}`;
    if (branchCache.has(key)) return branchCache.get(key)!;
    const branches = await prisma.providerBranch.findMany({ where: { tenantId, providerId, isActive: true }, select: { id: true } });
    const ids = branches.map((b) => b.id);
    branchCache.set(key, ids);
    return ids;
  }

  for (const u of providerUsers) {
    if (!u.providerId) { summary.review++; rows.push(`REVIEW(no providerId)      ${u.email}`); continue; }
    if (!u.isActive) { summary.review++; rows.push(`REVIEW(inactive user)      ${u.email}`); continue; }
    const branchIds = await activeBranchIds(u.providerId, u.tenantId);
    if (branchIds.length === 0) { summary.review++; rows.push(`REVIEW(provider 0 branches) ${u.email}`); continue; }

    const actorId = await resolveActor(u.tenantId, u.id);
    for (const branchId of branchIds) {
      if (apply) {
        try {
          await ProviderBranchAssignmentService.assign({ tenantId: u.tenantId, providerId: u.providerId, userId: u.id, providerBranchId: branchId, createdBy: actorId });
          summary.assigned++;
          rows.push(`ASSIGN ${u.email} → ${branchId}`);
        } catch (e) {
          if (e instanceof ProviderBranchAssignmentError && e.code === "DUPLICATE_ACTIVE") {
            summary.alreadyActive++;
            rows.push(`HAVE   ${u.email} → ${branchId}`);
          } else {
            rows.push(`ERROR  ${u.email} → ${branchId}: ${(e as Error).message}`);
          }
        }
      } else {
        // report: does an active assignment already exist?
        const active = await prisma.providerUserBranchAssignment.findFirst({
          where: { tenantId: u.tenantId, providerId: u.providerId, userId: u.id, providerBranchId: branchId, OR: [{ activeTo: null }, { activeTo: { gt: new Date() } }] },
          select: { id: true },
        });
        if (active) { summary.alreadyActive++; rows.push(`HAVE   ${u.email} → ${branchId}`); }
        else { summary.wouldAssign++; rows.push(`WOULD  ${u.email} → ${branchId}`); }
      }
    }
  }

  console.log(`\nPNOS F1.2 provider-user → branch backfill`);
  console.log(rows.join("\n") || "(no provider users found)");
  console.log("\nSummary:", JSON.stringify(summary, null, 2));
  if (!apply && summary.wouldAssign > 0) console.log(`\nReport only. Re-run with --apply to create ${summary.wouldAssign} assignment(s).`);
  if (summary.review > 0) console.log(`\n${summary.review} user(s) need manual review (not auto-assigned).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
