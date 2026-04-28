"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Portal {
  label:  string;
  href:   string;
  color:  string; // active bg
  dot:    string; // indicator colour
}

const ALL_PORTALS: Portal[] = [
  { label: "Admin",  href: "/dashboard",      color: "bg-avenue-indigo",  dot: "bg-avenue-indigo"  },
  { label: "Fund",   href: "/fund/dashboard",  color: "bg-[#28A745]",      dot: "bg-[#28A745]"      },
  { label: "Broker", href: "/broker/dashboard",color: "bg-[#17A2B8]",      dot: "bg-[#17A2B8]"      },
  { label: "HR",     href: "/hr/dashboard",    color: "bg-[#856404]",      dot: "bg-[#856404]"      },
];

const ROLE_PORTALS: Record<string, string[]> = {
  SUPER_ADMIN:       ["Admin", "Fund", "Broker", "HR"],
  FINANCE_OFFICER:   ["Admin", "Fund"],
  CLAIMS_OFFICER:    ["Admin"],
  MEDICAL_OFFICER:   ["Admin"],
  UNDERWRITER:       ["Admin"],
  CUSTOMER_SERVICE:  ["Admin"],
  REPORTS_VIEWER:    ["Admin"],
  FUND_ADMINISTRATOR:["Fund"],
  BROKER_USER:       ["Broker"],
  HR_MANAGER:        ["HR"],
};

interface Props {
  userRole: string;
}

export function PortalSwitcher({ userRole }: Props) {
  const pathname = usePathname();
  const allowed  = ROLE_PORTALS[userRole] ?? [];
  const visible  = ALL_PORTALS.filter(p => allowed.includes(p.label));

  // Only show the switcher when the user can reach more than one portal,
  // or always show it so they can see where they are.
  if (visible.length === 0) return null;

  const current = visible.find(p =>
    pathname === p.href || pathname.startsWith(p.href.replace("/dashboard", ""))
  );

  return (
    <div className="px-3 pb-3 pt-1">
      <p className="text-[9px] font-bold uppercase tracking-widest text-avenue-text-muted/60 mb-1.5 pl-1">
        Portal
      </p>
      <div className="flex flex-col gap-1">
        {visible.map(p => {
          const isActive = current?.label === p.label;
          return (
            <Link
              key={p.label}
              href={p.href}
              className={`flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? `${p.color} text-white`
                  : "text-avenue-text-muted hover:bg-[#F0F0F0] hover:text-avenue-text-heading"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-white/70" : p.dot}`} />
              {p.label}
              {isActive && (
                <span className="ml-auto text-[9px] font-bold uppercase tracking-wide opacity-70">
                  current
                </span>
              )}
            </Link>
          );
        })}
      </div>
      {visible.length > 1 && (
        <div className="mt-2 border-t border-[#EEEEEE]" />
      )}
    </div>
  );
}
