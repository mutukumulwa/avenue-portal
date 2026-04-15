"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard:    "Dashboard",
  groups:       "Groups",
  members:      "Members",
  endorsements: "Endorsements",
  packages:     "Packages",
  claims:       "Claims",
  preauth:      "Pre-Authorizations",
  providers:    "Providers",
  billing:      "Billing",
  gl:           "General Ledger",
  ledger:       "Account Ledger",
  brokers:      "Brokers",
  quotations:   "Quotations",
  reports:      "Reports",
  settings:     "Settings",
  exceptions:   "Exceptions",
  "new":        "New",
};

function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build crumbs: each crumb has a label and href
  const crumbs: { label: string; href: string }[] = [];
  let path = "";

  for (const seg of segments) {
    path += `/${seg}`;
    const label = SEGMENT_LABELS[seg] ?? (isUUID(seg) ? "Detail" : seg);
    crumbs.push({ label, href: path });
  }

  // Only show breadcrumbs when there's more than one segment
  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-avenue-text-muted mb-4">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={11} className="text-[#CCCCCC]" />}
            {isLast ? (
              <span className="font-semibold text-avenue-text-heading">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-avenue-indigo transition-colors font-medium">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
