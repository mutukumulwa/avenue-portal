/**
 * Provider Network OS — F1.1 provider permission catalog + persona role bundles.
 *
 * Additive to the existing dynamic RBAC (prisma/seeds/rbac.ts merges these in).
 * Codes follow the spec §7.1 dotted convention (`provider.<resource>.<action>`)
 * verbatim — later PNOS packages (F1.3+) check these exact strings via
 * rbacService.hasPermission, which matches on Permission.code.
 *
 * These grant ACTION permission only. They are NOT sufficient authorization on
 * their own: every provider resource is still scoped to the user's provider and
 * (from F1.2) assigned branches by ProviderAccessService. Provider boundary
 * checks remain independent of role (spec D4, §0.4).
 *
 * This file performs no I/O and creates nothing — it is pure data so it can be
 * unit-tested without a database.
 */

export interface PermissionDef {
  code: string;
  module: string;
  action: string;
  resource: string;
  description: string;
}

// Spec §7.1 catalog. resource/action are derived from the dotted code so the
// module/action/resource columns stay consistent and queryable.
const PROVIDER_PERMISSION_CODES: Array<{ code: string; description: string }> = [
  { code: "provider.eligibility.read", description: "Run a provider eligibility check for an entitled member" },
  { code: "provider.preauth.read", description: "View the provider's own pre-authorisations" },
  { code: "provider.preauth.create", description: "Submit a pre-authorisation request" },
  { code: "provider.preauth.respond", description: "Respond to a PA clinical information request" },
  { code: "provider.preauth.cancel", description: "Cancel the provider's own pre-authorisation before use" },
  { code: "provider.claim.read", description: "View the provider's own claims and safe exceptions" },
  { code: "provider.claim.create", description: "Submit a claim through canonical intake" },
  { code: "provider.claim.respond", description: "Respond to a claim information request / correctable exception" },
  { code: "provider.claim.withdraw", description: "Withdraw an undecided claim (nonfinancial)" },
  { code: "provider.claim.correct", description: "Submit a linked correction/replacement claim" },
  { code: "provider.claim.reconsider", description: "File a reconsideration against a decided claim" },
  { code: "provider.case.read", description: "View the provider's own inpatient cases" },
  { code: "provider.settlement.read", description: "View the provider's own remittance/settlement detail" },
  { code: "provider.settlement.export", description: "Export the provider's own remittance statement" },
  { code: "provider.payment_query.manage", description: "Open and manage payment queries" },
  { code: "provider.contract.read", description: "View the provider's own effective contract/rate terms" },
  { code: "provider.performance.read", description: "View the provider's own operational scorecards" },
  { code: "provider.profile.read", description: "View the provider's own profile/branch/credential data" },
  { code: "provider.profile.change_request", description: "Request a change to provider master data" },
  { code: "provider.users.manage", description: "Administer provider users, roles, and branch assignments" },
  { code: "provider.api_keys.manage", description: "Administer provider API keys/credentials" },
  { code: "provider.integrations.manage", description: "Administer provider integration connections" },
];

export const PROVIDER_PERMISSIONS: PermissionDef[] = PROVIDER_PERMISSION_CODES.map(({ code, description }) => {
  const [, resourcePart, actionPart] = code.split(".");
  return {
    code,
    module: "PROVIDER",
    action: (actionPart ?? "").toUpperCase(),
    resource: (resourcePart ?? "").toUpperCase(),
    description,
  };
});

export const PROVIDER_PERMISSION_CODE_SET = new Set(PROVIDER_PERMISSIONS.map((p) => p.code));

// ─── Persona role bundles (least-privilege per spec §2.4) ────────────────────
// Every persona sees only resources it needs; branch/provider scope is applied
// separately. "Must not" columns from §2.4 are enforced by ABSENCE here.

const FRONT_DESK = [
  "provider.eligibility.read",
  "provider.preauth.read", "provider.preauth.create",
  "provider.claim.read",
  "provider.case.read",
  "provider.profile.read",
]; // basic PA initiation + view allowed member/PA state. No settlement/api-keys/contract.

const CLINICIAN = [
  "provider.eligibility.read",
  "provider.preauth.read", "provider.preauth.create", "provider.preauth.respond",
  "provider.claim.read", "provider.claim.respond",
  "provider.case.read",
  "provider.profile.read",
]; // PA clinical detail + clinical request response. No settlement/api-keys/contract changes.

const BILLER = [
  "provider.eligibility.read",
  "provider.preauth.read",
  "provider.claim.read", "provider.claim.create", "provider.claim.respond",
  "provider.claim.withdraw", "provider.claim.correct", "provider.claim.reconsider",
  "provider.case.read",
  "provider.settlement.read",
  "provider.contract.read",
  "provider.profile.read",
]; // claims + corrections + resubmissions + remittance view. Not PA approve, not rate change, not user admin.

const FINANCE = [
  "provider.settlement.read", "provider.settlement.export",
  "provider.payment_query.manage",
  "provider.contract.read",
  "provider.performance.read",
  "provider.profile.read",
]; // settlement/exports/payment queries. No clinical documents or decisions.

const PROVIDER_ADMIN = [
  "provider.profile.read", "provider.profile.change_request",
  "provider.users.manage",
  "provider.api_keys.manage",
  "provider.performance.read",
  "provider.contract.read",
]; // manage users/branches, request profile changes, API-key admin if granted. Not contract/bank activation, not cross-provider.

const INTEGRATION_ADMIN = [
  "provider.api_keys.manage",
  "provider.integrations.manage",
  "provider.profile.read",
]; // scoped API keys + integration delivery/errors. No clinical/finance unless separately granted.

/**
 * Temporary backward-compatible role for existing provider users (spec F1.1
 * step 4). It reflects what a provider user can reach TODAY (eligibility,
 * claims view/create, cases, settlement view, API keys, PA via API) so that
 * enabling enforcement in a later package does not lock anyone out before
 * they are re-mapped to a persona role in F1.5. DEPRECATED on arrival — do not
 * assign to new users.
 */
const LEGACY = [
  "provider.eligibility.read",
  "provider.preauth.read", "provider.preauth.create",
  "provider.claim.read", "provider.claim.create",
  "provider.case.read",
  "provider.settlement.read",
  "provider.api_keys.manage",
  "provider.profile.read",
];

export const PROVIDER_ROLE_PERMISSIONS: Record<string, string[]> = {
  PROVIDER_FRONT_DESK: FRONT_DESK,
  PROVIDER_CLINICIAN: CLINICIAN,
  PROVIDER_BILLER: BILLER,
  PROVIDER_FINANCE: FINANCE,
  PROVIDER_ADMIN: PROVIDER_ADMIN,
  PROVIDER_INTEGRATION_ADMIN: INTEGRATION_ADMIN,
  PROVIDER_LEGACY: LEGACY,
};

export const PROVIDER_ROLE_CODES = Object.keys(PROVIDER_ROLE_PERMISSIONS);

/** Persona roles a new provider user may be assigned (excludes the deprecated legacy bundle). */
export const PROVIDER_PERSONA_ROLE_CODES = PROVIDER_ROLE_CODES.filter((c) => c !== "PROVIDER_LEGACY");
