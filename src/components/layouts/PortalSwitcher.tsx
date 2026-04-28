"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Portal {
  label:    string;
  href:     string;
  basePath: string;   // pathname prefix that means "I'm in this portal"
  activeClass: string;
  dotClass:    string;
}

const ALL_PORTALS: Portal[] = [
  { label: "Admin",  href: "/dashboard",      basePath: "/__admin__", activeClass: "bg-avenue-indigo text-white",  dotClass: "bg-avenue-indigo"  },
  { label: "Fund",   href: "/fund/dashboard",  basePath: "/fund",      activeClass: "bg-[#28A745] text-white",     dotClass: "bg-[#28A745]"      },
  { label: "Broker", href: "/broker/dashboard",basePath: "/broker",    activeClass: "bg-[#17A2B8] text-white",     dotClass: "bg-[#17A2B8]"      },
  { label: "HR",     href: "/hr/dashboard",    basePath: "/hr",        activeClass: "bg-[#856404] text-white",     dotClass: "bg-[#856404]"      },
];

// Admin portal is "active" on any path that isn't another dedicated portal
const OTHER_PORTAL_BASES = ["/fund", "/broker", "/hr", "/member"];

function isActive(portal: Portal, pathname: string): boolean {
  if (portal.label === "Admin") {
    return !OTHER_PORTAL_BASES.some(base => pathname.startsWith(base));
  }
  return pathname === portal.href || pathname.startsWith(portal.basePath + "/") || pathname === portal.basePath;
}

const ROLE_PORTALS: Record<string, string[]> = {
  SUPER_ADMIN:        ["Admin", "Fund", "Broker", "HR"],
  FINANCE_OFFICER:    ["Admin", "Fund"],
  CLAIMS_OFFICER:     ["Admin"],
  MEDICAL_OFFICER:    ["Admin"],
  UNDERWRITER:        ["Admin"],
  CUSTOMER_SERVICE:   ["Admin"],
  REPORTS_VIEWER:     ["Admin"],
  FUND_ADMINISTRATOR: ["Fund"],
  BROKER_USER:        ["Broker"],
  HR_MANAGER:         ["HR"],
};

export function PortalSwitcher({ userRole }: { userRole: string }) {
  const pathname = usePathname();
  const allowed  = ROLE_PORTALS[userRole] ?? [];
  const visible  = ALL_PORTALS.filter(p => allowed.includes(p.label));

  // Only show when the user has access to more than one portal
  if (visible.length <= 1) return null;

  return (
    <div className="mb-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-avenue-text-muted mb-1.5 px-1">
        Switch Portal
      </p>
      <div className="flex flex-col gap-1">
        {visible.map(p => {
          const active = isActive(p, pathname);
          return (
            <Link
              key={p.label}
              href={p.href}
              className={`flex items-center gap-2 rounded-[6px] px-2.5 py-2 text-sm font-semibold transition-all ${
                active
                  ? p.activeClass + " shadow-sm"
                  : "text-avenue-text-body bg-[#F4F4F4] hover:bg-[#E8E8E8]"
              }`}
            >
              <span className={`h-2 w-2 rounded-full shrink-0 ${active ? "bg-white/70" : p.dotClass}`} />
              {p.label}
              {active && (
                <span className="ml-auto text-[10px] opacity-75">current</span>
              )}
            </Link>
          );
        })}
      </div>
      <div className="mt-3 border-b border-[#EEEEEE]" />
    </div>
  );
}
