"use client";

/** DEF-001: the single signed-in-identity block used by every portal shell. */
export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administrator",
  CLAIMS_OFFICER: "Claims Officer",
  FINANCE_OFFICER: "Finance Officer",
  UNDERWRITER: "Underwriter",
  CUSTOMER_SERVICE: "Membership Officer",
  MEDICAL_OFFICER: "Medical Officer",
  REPORTS_VIEWER: "Reports Viewer",
  HR_MANAGER: "HR Manager",
  FUND_ADMINISTRATOR: "Fund Administrator",
  BROKER_USER: "Broker",
  MEMBER_USER: "Member",
  PROVIDER_USER: "Provider",
};

export function SignedInIdentity({
  name,
  role,
  subtitle,
  variant = "sidebar",
}: {
  name?: string | null;
  role?: string | null;
  subtitle?: string | null; // e.g. facility or group name
  variant?: "sidebar" | "bar";
}) {
  if (!name && !role) return null;
  const roleLabel = role ? ROLE_LABELS[role] ?? role : null;
  const base =
    variant === "sidebar"
      ? "rounded-[8px] border border-[#EEEEEE] bg-brand-bg-alt/40 px-2.5 py-2"
      : "flex flex-col items-end leading-tight";
  return (
    <div aria-label="Signed-in user" className={base}>
      {name && (
        <p className="truncate text-sm font-semibold text-brand-text-heading" title={name}>
          {name}
        </p>
      )}
      {roleLabel && <p className="truncate text-[11px] text-brand-text-muted">{roleLabel}</p>}
      {subtitle && <p className="truncate text-[10px] text-brand-text-muted">{subtitle}</p>}
    </div>
  );
}
