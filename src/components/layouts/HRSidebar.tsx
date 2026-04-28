"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Users, FileText,
  Receipt, PieChart,
  LogOut,
  Headset
} from "lucide-react";
import { PortalSwitcher } from "./PortalSwitcher";

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
      { label: "Endorsement Requests", href: "/hr/endorsements", icon: FileText },
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
            ? "bg-avenue-indigo/10 text-avenue-indigo"
            : "text-avenue-text-body hover:bg-avenue-bg-alt hover:text-avenue-indigo"
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 transition-colors ${
          isActive ? "text-avenue-indigo" : "group-hover:text-avenue-indigo text-avenue-text-muted"
        }`} />
        <span className="ml-2.5 text-sm font-semibold">{item.label}</span>
      </Link>
    </li>
  );
}

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <div className="mb-4">
      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-avenue-text-muted">
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

export function HRSidebar({ groupName, userRole }: { groupName: string; userRole: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 border-r border-[#EEEEEE] bg-white">
      <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
        {/* Logo */}
        <Link href="/hr/dashboard" className="mb-4 flex items-center pl-1 space-x-2">
          <div className="h-8 w-8 bg-avenue-indigo rounded-full shrink-0" />
          <span className="text-lg font-bold font-heading text-avenue-indigo tracking-tight leading-tight">
            AiCare<br />
            <span className="text-xs font-semibold text-avenue-text-muted font-body tracking-normal">{groupName}</span>
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
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full group flex items-center rounded-[8px] px-2 py-2 text-avenue-error hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="ml-2.5 text-sm font-semibold">Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
