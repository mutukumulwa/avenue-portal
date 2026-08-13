"use client";

import Link from "next/link";
import { SidebarDrawer } from "./SidebarDrawer";
import {
  LayoutDashboard,
  Building2,
  FileText,
  DollarSign,
  RefreshCw,
  Calculator,
  HelpCircle,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { PortalSwitcher } from "./PortalSwitcher";
import { SignedInIdentity } from "./SignedInIdentity";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/broker/dashboard", icon: LayoutDashboard },
  { label: "My Groups", href: "/broker/groups", icon: Building2 },
  { label: "Submissions", href: "/broker/submissions", icon: FileText },
  { label: "Quotations", href: "/broker/quotations", icon: Calculator },
  { label: "Commissions", href: "/broker/commissions", icon: DollarSign },
  { label: "Renewals", href: "/broker/renewals", icon: RefreshCw },
  { label: "Support", href: "/broker/support", icon: HelpCircle },
];

export function BrokerSidebar({ userRole, userName }: { userRole: string; userName?: string | null }) {
  return (
    <SidebarDrawer id="broker-sidebar" label="broker menu" width="w-64">
      <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
        <Link href="/broker/dashboard" className="mb-4 flex items-center pl-2.5 space-x-2">
          <div className="h-8 w-8 bg-brand-indigo rounded-full" />
          <span className="self-center whitespace-nowrap text-xl font-bold font-heading text-brand-indigo">
            Medvex | Broker
          </span>
        </Link>
        <PortalSwitcher userRole={userRole} />
        <ul className="space-y-1.5 font-medium">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex items-center rounded-[8px] p-2 text-brand-text-body hover:bg-brand-bg-alt hover:text-brand-indigo transition-colors"
                >
                  <Icon className="h-5 w-5 flex-shrink-0 transition-colors group-hover:text-brand-indigo text-brand-text-muted" />
                  <span className="ml-3 font-semibold">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto pt-4 border-t border-[#EEEEEE]">
          {/* DEF-001: the signed-in actor + persona must be evidenceable in the
              broker shell too (it was the one portal still missing the block). */}
          <div className="mb-2">
            <SignedInIdentity name={userName} role={userRole} />
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full group flex items-center rounded-[8px] p-2 text-brand-error hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="ml-3 font-semibold">Log out</span>
          </button>
        </div>
      </div>
    </SidebarDrawer>
  );
}
