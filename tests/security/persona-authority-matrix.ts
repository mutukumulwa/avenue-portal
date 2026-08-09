import type { UserRole } from "@/lib/authz/roles";

// THE APPROVED PERSONA AUTHORITY MATRIX — derived from workbook 02 Roles & Accounts
// + 06 Eligibility Oracle. This file is the single source of truth for what each
// persona may see. Changing it is a governed act (requires an owner-approved matrix
// update), NOT a convenience edit to make a test pass.
export const ALL_ROLES: UserRole[] = [
  "SUPER_ADMIN", "CLAIMS_OFFICER", "FINANCE_OFFICER", "UNDERWRITER",
  "CUSTOMER_SERVICE", "MEDICAL_OFFICER", "REPORTS_VIEWER",
  "HR_MANAGER", "FUND_ADMINISTRATOR", "BROKER_USER", "MEMBER_USER", "PROVIDER_USER",
];

// May view individual claims (claimant identity, provider, amount, status).
export const CLAIM_READ_ROLES: UserRole[] = ["SUPER_ADMIN", "CLAIMS_OFFICER", "MEDICAL_OFFICER"];

// May view portfolio money aggregates (loss ratio, billed/approved sums).
export const MONEY_READ_ROLES: UserRole[] = ["SUPER_ADMIN", "FINANCE_OFFICER"];

export const CLAIM_DENIED_ROLES = ALL_ROLES.filter((r) => !CLAIM_READ_ROLES.includes(r));
export const MONEY_DENIED_ROLES = ALL_ROLES.filter((r) => !MONEY_READ_ROLES.includes(r));
