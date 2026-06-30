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
