export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["ALL"],
  CLAIMS_OFFICER: ["READ_CLAIMS", "WRITE_CLAIMS", "READ_MEMBERS"],
  FINANCE_OFFICER: ["READ_BILLING", "WRITE_BILLING", "READ_GROUPS"],
  UNDERWRITER: ["READ_QUOTATIONS", "WRITE_QUOTATIONS", "READ_PACKAGES"],
  CUSTOMER_SERVICE: ["READ_MEMBERS", "READ_GROUPS", "WRITE_MEMBERS"],
  MEDICAL_OFFICER: ["READ_PREAUTH", "WRITE_PREAUTH", "READ_CLAIMS"],
  REPORTS_VIEWER: ["READ_REPORTS"],
  BROKER_USER: ["BROKER_PORTAL_ONLY"],
  MEMBER_USER: ["MEMBER_PORTAL_ONLY"],
};

// BD-01: role governance for the inline "Update Access" control on /settings.
//
// Portal roles are *scoped* — each is bound to a concrete Provider / Member /
// Broker / Group / Fund at invite time. The inline dropdown cannot capture that
// binding, so it must never mint or strip a portal role: a facility user was
// rendering as SUPER_ADMIN (its role was absent from the option list) and a
// careless Save could POST role=SUPER_ADMIN and escalate them to full admin.
//
// The inline control is therefore limited to STAFF roles. Portal users are
// locked (role preserved; only active/inactive toggles) and re-binding a portal
// role goes through the Invite/User-management flow.
export const PORTAL_ROLES = [
  "BROKER_USER",
  "MEMBER_USER",
  "HR_MANAGER",
  "FUND_ADMINISTRATOR",
  "PROVIDER_USER",
] as const;

export const STAFF_ROLES = [
  "SUPER_ADMIN",
  "CLAIMS_OFFICER",
  "FINANCE_OFFICER",
  "UNDERWRITER",
  "CUSTOMER_SERVICE",
  "MEDICAL_OFFICER",
  "REPORTS_VIEWER",
] as const;

export const ALL_USER_ROLES = [...STAFF_ROLES, ...PORTAL_ROLES] as const;

export function isPortalRole(role: string): boolean {
  return (PORTAL_ROLES as readonly string[]).includes(role);
}
export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

// Major Ugandan districts (Medvex operates in Uganda). Replaces the legacy
// Kenyan-county list (§D / D-8). Used as a geography reference / dropdown source.
export const UGANDA_DISTRICTS = [
  "Kampala", "Wakiso", "Mukono", "Jinja", "Mbarara", "Gulu", "Mbale",
  "Masaka", "Lira", "Kabarole", "Arua", "Hoima", "Soroti", "Kasese",
  "Entebbe", "Mityana",
];

export const STATUS_COLORS = {
  PENDING: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  SUSPENDED: "bg-red-100 text-red-800",
  LAPSED: "bg-gray-100 text-gray-800",
  TERMINATED: "bg-gray-800 text-white",
  APPROVED: "bg-green-100 text-green-800",
  DECLINED: "bg-red-100 text-red-800",
  PAID: "bg-blue-100 text-blue-800",
};
