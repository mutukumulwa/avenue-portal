/**
 * ensure-tenant-wiring.ts — Diagnosis Gate C3.1
 *
 * Grants the gate's permissions and creates its approval-matrix rule on tenants that
 * ALREADY EXIST.
 *
 * WHY THIS SCRIPT EXISTS: `seedRbac` and `tenant-provisioning.service` run when a tenant
 * is CREATED. A capability added afterwards reaches new tenants only, so the feature
 * ships, the UI renders, and the button fails for every existing customer — exactly the
 * F76-GAP-02 failure this engagement is required to avoid (execution plan §7, W1/W2).
 *
 * Idempotent: safe to run repeatedly, and safe to run before or after a deploy.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/diagnosis-gate/ensure-tenant-wiring.ts [--dry-run]
 */
import { prisma } from "@/lib/prisma";

const PERMISSIONS = [
  { code: "CLINICAL_PROTOCOL:VIEW", module: "CLINICAL_PROTOCOL", action: "VIEW", resource: "PROTOCOL_PACK", description: "View clinical protocol packs and their conditions" },
  { code: "CLINICAL_PROTOCOL:MANAGE", module: "CLINICAL_PROTOCOL", action: "MANAGE", resource: "PROTOCOL_PACK", description: "Import clinical content and submit it for approval (maker)" },
  { code: "CLINICAL_PROTOCOL:APPROVE", module: "CLINICAL_PROTOCOL", action: "APPROVE", resource: "PROTOCOL_PACK", description: "Approve and activate clinical protocol packs (checker)" },
  { code: "CLINICAL_GATE:REVIEW", module: "CLINICAL_PROTOCOL", action: "REVIEW", resource: "CLINICAL_FINDING", description: "Work the clinical review queue and record shadow verdicts" },
];

/** Must mirror prisma/seeds/rbac.ts — SUPER_ADMIN receives everything separately. */
const ROLE_GRANTS: Record<string, string[]> = {
  MEDICAL_OFFICER: ["CLINICAL_PROTOCOL:VIEW", "CLINICAL_PROTOCOL:MANAGE", "CLINICAL_PROTOCOL:APPROVE", "CLINICAL_GATE:REVIEW"],
  CLAIMS_OFFICER: ["CLINICAL_PROTOCOL:VIEW", "CLINICAL_GATE:REVIEW"],
  SUPER_ADMIN: PERMISSIONS.map((p) => p.code),
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const label = dryRun ? "[dry-run] would" : "";
  let permissionsCreated = 0;
  let grantsCreated = 0;
  let matrixCreated = 0;

  console.log(`\nDiagnosis Gate — tenant wiring${dryRun ? " (DRY RUN)" : ""}\n`);

  // 1. The permission rows themselves (global catalog).
  for (const p of PERMISSIONS) {
    const existing = await prisma.permission.findUnique({ where: { code: p.code }, select: { code: true } });
    if (existing) continue;
    if (!dryRun) await prisma.permission.create({ data: p });
    permissionsCreated += 1;
    console.log(`  ${label} create permission ${p.code}`);
  }

  // 2. Role grants, per tenant.
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true } });
  for (const tenant of tenants) {
    // Attribution for the grant, mirroring prisma/seeds/rbac.ts.
    const systemUser = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: "SUPER_ADMIN" }, select: { id: true } });
    const grantedById = systemUser?.id ?? "system";

    for (const [roleCode, codes] of Object.entries(ROLE_GRANTS)) {
      const role = await prisma.role.findFirst({ where: { tenantId: tenant.id, code: roleCode }, select: { id: true } });
      if (!role) {
        console.log(`  – ${tenant.slug}: role ${roleCode} not present, skipping`);
        continue;
      }
      for (const code of codes) {
        const permission = await prisma.permission.findUnique({ where: { code }, select: { id: true } });
        if (!permission) {
          // On a dry run the permission row does not exist yet, so the grant cannot be
          // looked up. Report it anyway — a dry run that silently under-reports is worse
          // than no dry run, because ops would size the change from it.
          if (dryRun) {
            grantsCreated += 1;
            console.log(`  ${label} grant ${code} → ${roleCode} (${tenant.slug})`);
          }
          continue;
        }
        const held = await prisma.rolePermission.findUnique({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          select: { roleId: true },
        });
        if (held) continue;
        if (!dryRun) {
          await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id, grantedById } });
        }
        grantsCreated += 1;
        console.log(`  ${label} grant ${code} → ${roleCode} (${tenant.slug})`);
      }
    }

    // 3. The approval-matrix rule, without which submitting content fails with
    //    PRECONDITION_FAILED rather than opening an approval.
    const existingRule = await prisma.approvalMatrix.count({ where: { tenantId: tenant.id, actionType: "CLINICAL_PROTOCOL_CHANGE" } });
    if (existingRule === 0) {
      if (!dryRun) {
        await prisma.approvalMatrix.create({
          data: {
            tenantId: tenant.id, actionType: "CLINICAL_PROTOCOL_CHANGE",
            serviceType: null, claimValueMin: null, claimValueMax: null, benefitCategory: null,
            requiredRole: "MEDICAL_OFFICER", requiresDual: false, effectiveFrom: new Date("2020-01-01"),
          },
        });
      }
      matrixCreated += 1;
      console.log(`  ${label} create approval-matrix rule CLINICAL_PROTOCOL_CHANGE → MEDICAL_OFFICER (${tenant.slug})`);
    }
  }

  console.log(
    `\n${dryRun ? "Would create" : "Created"}: ${permissionsCreated} permission(s), ${grantsCreated} role grant(s), ${matrixCreated} matrix rule(s) across ${tenants.length} tenant(s).`,
  );
  if (permissionsCreated + grantsCreated + matrixCreated === 0) console.log("Everything was already wired — nothing to do.");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
