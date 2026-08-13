"use client";

import Link from "next/link";
import { SidebarDrawer } from "./SidebarDrawer";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Users, FileText,
  Receipt, PieChart,
  LogOut,
  Headset
} from "lucide-react";
import { PortalSwitcher } from "./PortalSwitcher";
import { SignedInIdentity } from "./SignedInIdentity";

type NavItem  = { label: string; href: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/hr/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "My Group",
    items: [
      { label: "Roster", href: "/hr/roster", icon: Users },
      // DEF-005: "endorsement" is insurer-internal vocabulary surfaced directly in
      // the employer portal. The route stays; the label speaks the employer's
      // language. HR files requests about their staff — they are not filing
      // endorsements.
      { label: "Membership Requests", href: "/hr/endorsements", icon: FileText },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Invoices", href: "/hr/invoices", icon: Receipt },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Utilization", href: "/hr/utilization", icon: PieChart },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Service Requests", href: "/hr/support", icon: Headset },
    ],
  },
];

function NavItemRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <li>
      <Link
        href={item.href}
        className={`group flex items-center rounded-[8px] px-2 py-2 transition-colors ${
          isActive
            ? "bg-brand-indigo/10 text-brand-indigo"
            : "text-brand-text-body hover:bg-brand-bg-alt hover:text-brand-indigo"
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 transition-colors ${
          isActive ? "text-brand-indigo" : "group-hover:text-brand-indigo text-brand-text-muted"
        }`} />
        <span className="ml-2.5 text-sm font-semibold">{item.label}</span>
      </Link>
    </li>
  );
}

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <div className="mb-4">
      <div className="px-2 py-1.5 text-[10px] font-bold uppercase text-brand-text-muted">
        {group.label}
      </div>
      <ul className="space-y-0.5 mt-1">
        {group.items.map(item => (
          <NavItemRow key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </div>
  );
}

export function HRSidebar({ groupName, userRole, userName }: { groupName: string; userRole: string; userName?: string | null }) {
  const pathname = usePathname();

  return (
    <SidebarDrawer id="hr-sidebar" label="HR menu" width="w-60">
      <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
        {/* Logo */}
        <Link href="/hr/dashboard" className="mb-4 flex items-center pl-1 space-x-2">
          <div className="h-8 w-8 bg-brand-indigo rounded-full shrink-0" />
          <span className="text-lg font-bold font-heading text-brand-indigo leading-tight">
            Medvex<br />
            <span className="text-xs font-semibold text-brand-text-muted font-body">{groupName}</span>
          </span>
        </Link>

        {/* Portal switcher */}
        <PortalSwitcher userRole={userRole} />

        {/* Nav groups */}
        <nav className="flex-1 mt-2">
          {NAV_GROUPS.map(group => (
            <NavGroupSection key={group.label} group={group} pathname={pathname} />
          ))}
        </nav>

        {/* Bottom */}
        <div className="pt-3 border-t border-[#EEEEEE] space-y-0.5">
          {/* DEF-001: signed-in actor + effective role, evidenceable on-screen. */}
          <div className="mb-2">
            <SignedInIdentity name={userName} role={userRole} subtitle={groupName} />
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full group flex items-center rounded-[8px] px-2 py-2 text-brand-error hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="ml-2.5 text-sm font-semibold">Log out</span>
          </button>
        </div>
      </div>
    </SidebarDrawer>
  );
}
