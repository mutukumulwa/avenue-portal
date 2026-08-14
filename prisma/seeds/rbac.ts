import { PrismaClient } from "@prisma/client";
import {
  PROVIDER_PERMISSIONS,
  PROVIDER_ROLE_PERMISSIONS,
  PROVIDER_ROLE_CODES,
} from "./provider-rbac";

// ─── PERMISSION DEFINITIONS ──────────────────────────────────────────────────

export const PERMISSIONS: Array<{
  code: string;
  module: string;
  action: string;
  resource: string;
  description: string;
}> = [
  // QUOTATION
  { code: "QUOTATION:VIEW",           module: "QUOTATION",     action: "VIEW",     resource: "QUOTATION",    description: "View quotations" },
  { code: "QUOTATION:CREATE",         module: "QUOTATION",     action: "CREATE",   resource: "QUOTATION",    description: "Create new quotations" },
  { code: "QUOTATION:ISSUE",          module: "QUOTATION",     action: "ISSUE",    resource: "QUOTATION",    description: "Issue a quotation to a submitter" },
  { code: "QUOTATION:APPROVE_BINDER", module: "QUOTATION",     action: "APPROVE",  resource: "BINDER",       description: "Senior approval to bind a quotation into a membership" },
  { code: "QUOTATION:DECLINE",        module: "QUOTATION",     action: "DECLINE",  resource: "QUOTATION",    description: "Decline a quotation" },
  { code: "QUOTATION:WITHDRAW",       module: "QUOTATION",     action: "WITHDRAW", resource: "QUOTATION",    description: "Withdraw an issued quotation" },
  // UNDERWRITING
  { code: "UNDERWRITING:VIEW",            module: "UNDERWRITING", action: "VIEW",           resource: "ASSESSMENT",   description: "View underwriting assessments" },
  { code: "UNDERWRITING:ASSESS",          module: "UNDERWRITING", action: "ASSESS",         resource: "ASSESSMENT",   description: "Perform risk assessment on a submission" },
  { code: "UNDERWRITING:RECORD_DECISION", module: "UNDERWRITING", action: "RECORD",         resource: "DECISION",     description: "Record per-life underwriting decisions" },
  { code: "UNDERWRITING:APPROVE_SENIOR",  module: "UNDERWRITING", action: "APPROVE_SENIOR", resource: "ASSESSMENT",   description: "Senior approval of escalated assessments" },
  { code: "UNDERWRITING:DECLINE",         module: "UNDERWRITING", action: "DECLINE",        resource: "ASSESSMENT",   description: "Decline a submission after assessment" },
  // CLAIM
  { code: "CLAIM:VIEW",           module: "CLAIM", action: "VIEW",           resource: "CLAIM", description: "View claims" },
  { code: "CLAIM:CREATE",         module: "CLAIM", action: "CREATE",         resource: "CLAIM", description: "Submit a new claim" },
  { code: "CLAIM:ADJUDICATE",     module: "CLAIM", action: "ADJUDICATE",     resource: "CLAIM", description: "Adjudicate claim lines" },
  { code: "CLAIM:APPROVE_SENIOR", module: "CLAIM", action: "APPROVE_SENIOR", resource: "CLAIM", description: "Senior approval for high-value claims" },
  { code: "CLAIM:SETTLE",         module: "CLAIM", action: "SETTLE",         resource: "CLAIM", description: "Approve provider settlement batches" },
  { code: "CLAIM:APPEAL",         module: "CLAIM", action: "APPEAL",         resource: "CLAIM", description: "Initiate and process claim appeals" },
  { code: "CLAIM:VOID",           module: "CLAIM", action: "VOID",           resource: "CLAIM", description: "Void a claim" },
  // PREAUTH
  { code: "PREAUTH:VIEW",           module: "PREAUTH", action: "VIEW",           resource: "PREAUTH", description: "View pre-authorization requests" },
  { code: "PREAUTH:CREATE",         module: "PREAUTH", action: "CREATE",         resource: "PREAUTH", description: "Submit a pre-authorization request" },
  { code: "PREAUTH:ADJUDICATE",     module: "PREAUTH", action: "ADJUDICATE",     resource: "PREAUTH", description: "Review and decide on a pre-auth request" },
  { code: "PREAUTH:APPROVE_SENIOR", module: "PREAUTH", action: "APPROVE_SENIOR", resource: "PREAUTH", description: "Senior approval for escalated pre-auths" },
  { code: "PREAUTH:ESCALATE",       module: "PREAUTH", action: "ESCALATE",       resource: "PREAUTH", description: "Escalate a pre-auth to clinical or senior review" },
  // MEMBER
  { code: "MEMBER:VIEW",       module: "MEMBER", action: "VIEW",       resource: "MEMBER", description: "View member records" },
  { code: "MEMBER:CREATE",     module: "MEMBER", action: "CREATE",     resource: "MEMBER", description: "Enrol new members" },
  { code: "MEMBER:AMEND",      module: "MEMBER", action: "AMEND",      resource: "MEMBER", description: "Process mid-term membership amendments" },
  { code: "MEMBER:TERMINATE",  module: "MEMBER", action: "TERMINATE",  resource: "MEMBER", description: "Terminate a membership (fraud, breach, death)" },
  { code: "MEMBER:REINSTATE",  module: "MEMBER", action: "REINSTATE",  resource: "MEMBER", description: "Reinstate a lapsed membership" },
  // BILLING
  { code: "BILLING:VIEW",              module: "BILLING", action: "VIEW",              resource: "BILLING",     description: "View invoices and payments" },
  { code: "BILLING:POST_DEBIT_NOTE",   module: "BILLING", action: "POST",              resource: "DEBIT_NOTE",  description: "Post a debit note after binding" },
  { code: "BILLING:APPROVE_SETTLEMENT",module: "BILLING", action: "APPROVE",           resource: "SETTLEMENT",  description: "Checker approval on provider settlement batches" },
  // BROKER
  { code: "BROKER:VIEW",              module: "BROKER", action: "VIEW",    resource: "BROKER",      description: "View broker records" },
  { code: "BROKER:APPROVE_COMMISSION",module: "BROKER", action: "APPROVE", resource: "COMMISSION",  description: "Approve and release commission payouts" },
  // GROUP
  { code: "GROUP:VIEW",    module: "GROUP", action: "VIEW",    resource: "GROUP", description: "View group/scheme records" },
  { code: "GROUP:CREATE",  module: "GROUP", action: "CREATE",  resource: "GROUP", description: "Create a new group/scheme" },
  { code: "GROUP:UPDATE",  module: "GROUP", action: "UPDATE",  resource: "GROUP", description: "Update group details and settings" },
  { code: "GROUP:SUSPEND", module: "GROUP", action: "SUSPEND", resource: "GROUP", description: "Suspend or lapse a group" },
  // ANALYTICS
  { code: "ANALYTICS:VIEW",           module: "ANALYTICS", action: "VIEW",   resource: "ANALYTICS",    description: "View standard analytics dashboards" },
  { code: "ANALYTICS:VIEW_PORTFOLIO", module: "ANALYTICS", action: "VIEW",   resource: "PORTFOLIO",    description: "View senior portfolio-level analytics" },
  { code: "ANALYTICS:VIEW_PARITY",    module: "ANALYTICS", action: "VIEW",   resource: "PARITY",       description: "View parity compliance dashboard (compliance-gated)" },
  // COMPLIANCE
  { code: "COMPLIANCE:VIEW_AUDIT_CHAIN", module: "COMPLIANCE", action: "VIEW", resource: "AUDIT_CHAIN", description: "Browse and verify the audit chain" },
  { code: "COMPLIANCE:VIEW_OVERRIDES",   module: "COMPLIANCE", action: "VIEW", resource: "OVERRIDES",   description: "View override records and patterns" },
  { code: "COMPLIANCE:VIEW_PARITY",      module: "COMPLIANCE", action: "VIEW", resource: "PARITY",      description: "View parity compliance metrics" },
  // OVERRIDE
  { code: "OVERRIDE:REQUEST",       module: "OVERRIDE", action: "REQUEST", resource: "OVERRIDE", description: "Request a rule override" },
  { code: "OVERRIDE:APPROVE_SINGLE",module: "OVERRIDE", action: "APPROVE", resource: "OVERRIDE", description: "Approve single-approver overrides" },
  { code: "OVERRIDE:APPROVE_DUAL",  module: "OVERRIDE", action: "APPROVE", resource: "OVERRIDE", description: "Second approver for dual-control overrides" },
  // ROLE
  { code: "ROLE:VIEW",              module: "ROLE", action: "VIEW",    resource: "ROLE",       description: "View role assignments" },
  { code: "ROLE:ASSIGN",            module: "ROLE", action: "ASSIGN",  resource: "ROLE",       description: "Initiate a role assignment (maker)" },
  { code: "ROLE:APPROVE_ASSIGNMENT",module: "ROLE", action: "APPROVE", resource: "ASSIGNMENT", description: "Approve a pending role assignment (checker)" },
  { code: "ROLE:REVOKE",            module: "ROLE", action: "REVOKE",  resource: "ROLE",       description: "Revoke a role assignment" },
  // SETTINGS
  { code: "SETTINGS:VIEW",   module: "SETTINGS", action: "VIEW",   resource: "SETTINGS", description: "View system settings" },
  { code: "SETTINGS:UPDATE", module: "SETTINGS", action: "UPDATE", resource: "SETTINGS", description: "Update system settings" },
  // CLINICAL PROTOCOL (Diagnosis Gate, DG C3.1)
  { code: "CLINICAL_PROTOCOL:VIEW",    module: "CLINICAL_PROTOCOL", action: "VIEW",    resource: "PROTOCOL_PACK", description: "View clinical protocol packs and their conditions" },
  { code: "CLINICAL_PROTOCOL:MANAGE",  module: "CLINICAL_PROTOCOL", action: "MANAGE",  resource: "PROTOCOL_PACK", description: "Import clinical content and submit it for approval (maker)" },
  { code: "CLINICAL_PROTOCOL:APPROVE", module: "CLINICAL_PROTOCOL", action: "APPROVE", resource: "PROTOCOL_PACK", description: "Approve and activate clinical protocol packs (checker)" },
  { code: "CLINICAL_GATE:REVIEW",      module: "CLINICAL_PROTOCOL", action: "REVIEW",  resource: "CLINICAL_FINDING", description: "Work the clinical review queue and record shadow verdicts" },
  // REPORT
  { code: "REPORT:VIEW",     module: "REPORT", action: "VIEW",     resource: "REPORT", description: "View reports" },
  { code: "REPORT:GENERATE", module: "REPORT", action: "GENERATE", resource: "REPORT", description: "Generate and download reports" },

  // ── UAT-HF remediation (DEC-14) ───────────────────────────────────────────
  // Dotted codes, matching the constants the runtime actually checks. See the
  // note in src/lib/authz/catalog.ts for why they are not MODULE:ACTION.
  { code: "member.sensitive.reveal",  module: "MEMBER",   action: "REVEAL", resource: "SENSITIVE_FIELD",   description: "Unmask a member's ID number or phone (audited reveal)" },
  { code: "member.duplicate.review",  module: "MEMBER",   action: "REVIEW", resource: "DUPLICATE",         description: "Resolve a duplicate-identity match to a named member (audited)" },
  { code: "network.analytics.read",   module: "PROVIDER", action: "VIEW",   resource: "NETWORK_ANALYTICS", description: "Read provider network performance analytics" },
  { code: "support.operation.lookup", module: "SETTINGS", action: "VIEW",   resource: "OPERATION",         description: "Look up another user's operation receipt for support" },
];

// PNOS F1.1: merge the provider permission catalog additively (before
// ALL_PERMISSION_CODES is computed below, so SUPER_ADMIN also receives them).
PERMISSIONS.push(...PROVIDER_PERMISSIONS);

// ─── ROLE PERMISSION MAPPINGS ────────────────────────────────────────────────

// DEF-004: UNDERWRITER holds no claim/pre-auth grants (matches catalog.ts; the
// parity suite asserts catalog ≡ seed). SENIOR_UNDERWRITER spreads this list and
// correctly loses the same two grants.
const UNDERWRITER_PERMS = [
  "network.analytics.read",
  "QUOTATION:VIEW", "QUOTATION:CREATE", "QUOTATION:ISSUE", "QUOTATION:DECLINE", "QUOTATION:WITHDRAW",
  "UNDERWRITING:VIEW", "UNDERWRITING:ASSESS", "UNDERWRITING:RECORD_DECISION", "UNDERWRITING:DECLINE",
  "MEMBER:VIEW", "MEMBER:CREATE", "MEMBER:AMEND", "MEMBER:REINSTATE",
  "BILLING:VIEW", "BROKER:VIEW",
  "ANALYTICS:VIEW",
  "GROUP:VIEW", "GROUP:CREATE", "GROUP:UPDATE",
  "OVERRIDE:REQUEST",
  "ROLE:VIEW", "SETTINGS:VIEW", "REPORT:VIEW",
];

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  UNDERWRITER: UNDERWRITER_PERMS,

  SENIOR_UNDERWRITER: [
    ...UNDERWRITER_PERMS,
    "QUOTATION:APPROVE_BINDER",
    "UNDERWRITING:APPROVE_SENIOR",
    "MEMBER:TERMINATE",
    "GROUP:SUSPEND",
    "ANALYTICS:VIEW_PORTFOLIO",
    "OVERRIDE:APPROVE_SINGLE", "OVERRIDE:APPROVE_DUAL",
    "ROLE:ASSIGN", "ROLE:APPROVE_ASSIGNMENT", "ROLE:REVOKE",
    "SETTINGS:UPDATE",
    "REPORT:GENERATE",
  ],

  CLAIMS_OFFICER: [
    "CLAIM:VIEW", "CLAIM:CREATE", "CLAIM:ADJUDICATE", "CLAIM:APPEAL",
    "PREAUTH:VIEW", "PREAUTH:ADJUDICATE", "PREAUTH:ESCALATE",
    "MEMBER:VIEW", "BILLING:VIEW",
    "ANALYTICS:VIEW",
    "OVERRIDE:REQUEST",
    "ROLE:VIEW", "REPORT:VIEW",
    // Diagnosis Gate: works the clinical review queue and can see the rules a
    // finding came from, but cannot author or approve clinical content.
    "CLINICAL_PROTOCOL:VIEW", "CLINICAL_GATE:REVIEW",
  ],

  SENIOR_CLAIMS_OFFICER: [
    "CLAIM:VIEW", "CLAIM:CREATE", "CLAIM:ADJUDICATE", "CLAIM:APPEAL",
    "CLAIM:APPROVE_SENIOR", "CLAIM:SETTLE", "CLAIM:VOID",
    "PREAUTH:VIEW", "PREAUTH:ADJUDICATE", "PREAUTH:ESCALATE", "PREAUTH:APPROVE_SENIOR",
    "MEMBER:VIEW", "BILLING:VIEW", "BILLING:APPROVE_SETTLEMENT",
    "ANALYTICS:VIEW",
    "OVERRIDE:REQUEST", "OVERRIDE:APPROVE_SINGLE", "OVERRIDE:APPROVE_DUAL",
    "ROLE:VIEW", "REPORT:VIEW", "REPORT:GENERATE",
  ],

  PRE_AUTH_OFFICER: [
    "PREAUTH:VIEW", "PREAUTH:ADJUDICATE", "PREAUTH:ESCALATE",
    "CLAIM:VIEW", "MEMBER:VIEW",
    "ANALYTICS:VIEW",
    "OVERRIDE:REQUEST",
    "ROLE:VIEW", "REPORT:VIEW",
  ],

  FINANCE_OFFICER: [
    "BILLING:VIEW", "BILLING:POST_DEBIT_NOTE", "BILLING:APPROVE_SETTLEMENT",
    "CLAIM:VIEW", "MEMBER:VIEW",
    "BROKER:VIEW", "BROKER:APPROVE_COMMISSION",
    "ANALYTICS:VIEW",
    "ROLE:VIEW", "REPORT:VIEW", "REPORT:GENERATE",
  ],

  // DECISION D1 — BRANCH A (2026-08-08): the Membership Officer is
  // MEMBERSHIP-ONLY. CLAIM:VIEW, PREAUTH:VIEW, BILLING:VIEW and ANALYTICS:VIEW
  // were removed: they contradicted src/lib/constants.ts, the UAT role charter
  // and the signed-off eligibility oracle, and carried no review trail — drift
  // rather than decision. They are the grants behind DEF-003 (S1).
  //
  // Keep in lockstep with ROLE_GRANTS in src/lib/authz/catalog.ts; the parity
  // suite (tests/security/authz-parity.test.ts) fails the build if they differ.
  CUSTOMER_SERVICE: [
    "member.sensitive.reveal", "member.duplicate.review",
    "MEMBER:VIEW", "MEMBER:CREATE", "MEMBER:AMEND", "MEMBER:REINSTATE",
    "GROUP:VIEW",
    "OVERRIDE:REQUEST",
    "ROLE:VIEW", "REPORT:VIEW",
  ],

  MEDICAL_OFFICER: [
    "CLAIM:VIEW", "PREAUTH:VIEW", "PREAUTH:ADJUDICATE",
    "MEMBER:VIEW",
    "ANALYTICS:VIEW",
    "ROLE:VIEW",
    // Diagnosis Gate: the clinical content owner. MANAGE and APPROVE are both held
    // by this role because clinical content should be checked by another clinician —
    // maker ≠ checker is enforced per request on the identity, not the role.
    "CLINICAL_PROTOCOL:VIEW", "CLINICAL_PROTOCOL:MANAGE", "CLINICAL_PROTOCOL:APPROVE",
    "CLINICAL_GATE:REVIEW",
  ],

  MEDICAL_ADVISOR: [
    "CLAIM:VIEW", "PREAUTH:VIEW", "PREAUTH:ADJUDICATE",
    "MEMBER:VIEW",
  ],

  SCHEME_MANAGER: [
    "GROUP:VIEW", "GROUP:CREATE", "GROUP:UPDATE",
    "MEMBER:VIEW",
    "QUOTATION:VIEW",
    "BILLING:VIEW",
    "ANALYTICS:VIEW", "ANALYTICS:VIEW_PORTFOLIO",
    "BROKER:VIEW",
    "ROLE:VIEW", "REPORT:VIEW", "REPORT:GENERATE",
  ],

  COMPLIANCE_OFFICER: [
    "COMPLIANCE:VIEW_AUDIT_CHAIN", "COMPLIANCE:VIEW_OVERRIDES", "COMPLIANCE:VIEW_PARITY",
    "ANALYTICS:VIEW", "ANALYTICS:VIEW_PORTFOLIO", "ANALYTICS:VIEW_PARITY",
    "CLAIM:VIEW", "MEMBER:VIEW",
    "OVERRIDE:APPROVE_DUAL",
    "ROLE:VIEW", "REPORT:VIEW", "REPORT:GENERATE",
  ],

  REPORTS_VIEWER: [
    "ANALYTICS:VIEW", "CLAIM:VIEW", "MEMBER:VIEW",
    "ROLE:VIEW", "REPORT:VIEW", "REPORT:GENERATE",
  ],

  BROKER_USER: [
    "GROUP:VIEW", "MEMBER:VIEW",
    "QUOTATION:VIEW", "QUOTATION:CREATE",
    "CLAIM:VIEW",
    "ANALYTICS:VIEW",
    "ROLE:VIEW", "REPORT:VIEW",
  ],

  MEMBER_USER: [
    "MEMBER:VIEW",
    "CLAIM:VIEW",
    "PREAUTH:VIEW", "PREAUTH:CREATE",
    "BILLING:VIEW",
  ],

  HR_MANAGER: [
    "MEMBER:VIEW", "MEMBER:CREATE", "MEMBER:AMEND",
    "GROUP:VIEW", "CLAIM:VIEW", "BILLING:VIEW",
    "ROLE:VIEW", "REPORT:VIEW",
  ],

  FUND_ADMINISTRATOR: [
    "BILLING:VIEW", "BILLING:POST_DEBIT_NOTE",
    "GROUP:VIEW", "MEMBER:VIEW",
    "ANALYTICS:VIEW",
    "ROLE:VIEW", "REPORT:VIEW",
  ],
};

// PNOS F1.1: merge provider persona role bundles additively (before SUPER_ADMIN
// is computed, so SUPER_ADMIN — which takes ALL_PERMISSION_CODES — still spans
// provider permissions too).
Object.assign(ROLE_PERMISSIONS, PROVIDER_ROLE_PERMISSIONS);

// SUPER_ADMIN gets all permissions
const ALL_PERMISSION_CODES = PERMISSIONS.map((p) => p.code);
ROLE_PERMISSIONS["SUPER_ADMIN"] = ALL_PERMISSION_CODES;

// ─── ROLE CODE LIST ──────────────────────────────────────────────────────────

export const ROLE_CODES = [
  // Existing roles (mapped from UserRole enum)
  "SUPER_ADMIN", "CLAIMS_OFFICER", "FINANCE_OFFICER", "UNDERWRITER",
  "CUSTOMER_SERVICE", "MEDICAL_OFFICER", "REPORTS_VIEWER",
  "BROKER_USER", "MEMBER_USER", "HR_MANAGER", "FUND_ADMINISTRATOR",
  // New roles
  "SENIOR_UNDERWRITER", "PRE_AUTH_OFFICER", "SENIOR_CLAIMS_OFFICER",
  "SCHEME_MANAGER", "COMPLIANCE_OFFICER", "MEDICAL_ADVISOR",
  // PNOS F1.1: provider persona roles (+ deprecated PROVIDER_LEGACY)
  ...PROVIDER_ROLE_CODES,
];

// These role codes match UserRole enum values — used for migrating existing user assignments
const ENUM_ROLE_CODES = new Set([
  "SUPER_ADMIN", "CLAIMS_OFFICER", "FINANCE_OFFICER", "UNDERWRITER",
  "CUSTOMER_SERVICE", "MEDICAL_OFFICER", "REPORTS_VIEWER",
  "BROKER_USER", "MEMBER_USER", "HR_MANAGER", "FUND_ADMINISTRATOR",
]);

// ─── SEED FUNCTION ───────────────────────────────────────────────────────────

export async function seedRbac(prisma: PrismaClient, tenantId: string) {
  console.log("  🔐 Seeding RBAC roles and permissions...");

  // 1. Upsert permissions (global — not tenant-specific)
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`  ✅ ${PERMISSIONS.length} permissions upserted`);

  // 2. Upsert roles for this tenant
  const roleMap: Record<string, string> = {}; // code → id
  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { isActive: true },
      create: {
        tenantId,
        code,
        isSystemRole: true,
        isActive: true,
      },
    });
    roleMap[code] = role.id;
  }
  console.log(`  ✅ ${ROLE_CODES.length} roles upserted`);

  // 3. Upsert role-permission mappings
  // Find a system user to attribute grants to (first SUPER_ADMIN, or fallback to first user)
  const systemUser = await prisma.user.findFirst({
    where: { tenantId, role: "SUPER_ADMIN" },
    select: { id: true },
  });
  const grantedById = systemUser?.id ?? "system";

  let rpCount = 0;
  for (const [roleCode, permCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;

    // Deduplicate permission codes for this role
    const dedupedPerms = [...new Set(permCodes)];

    for (const permCode of dedupedPerms) {
      const permission = await prisma.permission.findUnique({ where: { code: permCode } });
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        update: {},
        create: { roleId, permissionId: permission.id, grantedById },
      });
      rpCount++;
    }
  }
  console.log(`  ✅ ${rpCount} role-permission mappings upserted`);

  // 4. Migrate existing User.role values to UserRoleAssignment
  //    Find all users in this tenant that have a role matching an enum value
  //    and don't already have an active assignment for that role
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, role: true },
  });

  let assignCount = 0;
  let revokedSkipped = 0;
  let alreadyAssignedSkipped = 0;
  for (const user of users) {
    const roleCode = user.role as string;
    if (!ENUM_ROLE_CODES.has(roleCode)) continue;

    const roleId = roleMap[roleCode];
    if (!roleId) continue;

    // UAT-HF DEC-16 — do not resurrect access somebody deliberately removed.
    //
    // This previously looked only for an ACTIVE assignment, so a revoked one was
    // invisible and this step re-created it. Revoking is the ONLY permission
    // action the admin UI offers (`revokeAssignmentAction`), and provisioning
    // runs `seedRbac` — so the single control an administrator has was undone by
    // the routine command that fixes everything else, silently, with the new row
    // self-made and self-checked.
    //
    // Revocation retains the row and stamps `revokedAt`/`revokedById`, so the
    // decision is on the record. It just was not being read.
    // UAT-HF P12.04f — do not re-add a role a deliberate assignment superseded.
    //
    // Found in production on 2026-08-14: a UAT account whose `User.role` said
    // UNDERWRITER had been given an ACTIVE SENIOR_UNDERWRITER assignment to make
    // it a *checker*, and the enum column was never updated. Re-running the seed
    // handed UNDERWRITER back — putting maker and checker on one account and
    // collapsing, there, the separation the move had created.
    //
    // So: any active assignment at all means somebody has deliberately set this
    // user's roles, and the legacy column stops being a source of new ones. Not
    // scoped to `roleId` — that is precisely the scoping that let a DIFFERENT
    // role be added beside the deliberate one.
    //
    // This removes no access. `effectivePermissions` unions the enum-role
    // baseline from ROLE_GRANTS with the codes from assignments, so `User.role`
    // still grants what it always did; the assignment row is a migration
    // record, not the mechanism. Skipping it costs nobody a permission.
    const activeAssignment = await prisma.userRoleAssignment.findFirst({
      where: { userId: user.id, tenantId, isActive: true },
      select: { id: true },
    });
    if (activeAssignment) {
      alreadyAssignedSkipped++;
      continue;
    }

    const prior = await prisma.userRoleAssignment.findMany({
      where: { userId: user.id, roleId, tenantId },
      select: { isActive: true, revokedAt: true },
    });

    if (prior.some((a) => a.revokedAt !== null)) {
      // Deliberately removed. Re-granting is a decision for a human with a
      // reason, not a side effect of provisioning.
      revokedSkipped++;
      continue;
    }

    await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId,
        tenantId,
        isActive: true,
        makerId: user.id,      // self-assigned during migration
        checkerId: user.id,    // self-checked during migration (bootstrap exception)
        status: "ACTIVE",
        assignedAt: new Date(),
      },
    });
    assignCount++;
  }
  console.log(`  ✅ ${assignCount} existing user role assignments migrated`);
  if (revokedSkipped > 0) {
    console.log(
      `  ⏭️  ${revokedSkipped} skipped — previously revoked, left revoked (DEC-16). ` +
        `Re-grant deliberately if that is wrong.`,
    );
  }
  if (alreadyAssignedSkipped > 0) {
    // Said out loud, because a silent skip is how the opposite behaviour went
    // unnoticed: whoever runs this should see that the legacy column was
    // deliberately not applied to these users.
    console.log(
      `  ⏭️  ${alreadyAssignedSkipped} skipped — already hold an active assignment, so ` +
        `User.role was not re-applied (P12.04f). Their access is unchanged: the enum ` +
        `role still grants its baseline through effectivePermissions.`,
    );
  }
}
