"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, FileText, BarChart2, LogOut } from "lucide-react";
import { PortalSwitcher } from "./PortalSwitcher";

const STATIC_ITEMS = [
  { label: "Dashboard", href: "/fund/dashboard", icon: LayoutDashboard },
];

interface FundScheme {
  id: string;
  name: string;
  balance: number;
  isLow: boolean;
}

interface Props { schemes: FundScheme[]; userRole: string }

export function FundSidebar({ schemes, userRole }: Props) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-[#EEEEEE] bg-white">
      <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
        {/* Brand */}
        <Link href="/fund/dashboard" className="mb-6 flex items-center pl-2.5 space-x-2">
          <div className="h-8 w-8 bg-[#28A745] rounded-full flex items-center justify-center">
            <Wallet size={16} className="text-white" />
          </div>
          <span className="text-xl font-bold font-heading text-[#28A745] tracking-tight">
            Fund Admin
          </span>
        </Link>

        {/* Portal switcher */}
        <PortalSwitcher userRole={userRole} />

        {/* Static nav */}
        <ul className="space-y-1 font-medium mb-4">
          {STATIC_ITEMS.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link href={item.href}
                  className={`group flex items-center rounded-[8px] p-2 transition-colors ${active ? "bg-[#28A745]/10 text-[#28A745]" : "text-avenue-text-body hover:bg-avenue-bg-alt hover:text-[#28A745]"}`}>
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="ml-3 font-semibold">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Per-scheme links */}
        {schemes.length > 0 && (
          <div className="mb-2">
            <p className="px-2 text-[10px] font-bold uppercase tracking-widest text-avenue-text-muted mb-1">
              My Schemes
            </p>
            <ul className="space-y-0.5">
              {schemes.map(s => {
                const groupActive = pathname.startsWith(`/fund/${s.id}`);
                return (
                  <li key={s.id}>
                    <Link href={`/fund/${s.id}`}
                      className={`group flex items-center justify-between rounded-[8px] px-2 py-1.5 transition-colors text-sm ${groupActive ? "bg-[#28A745]/10 text-[#28A745] font-semibold" : "text-avenue-text-body hover:bg-avenue-bg-alt hover:text-[#28A745]"}`}>
                      <span className="truncate">{s.name}</span>
                      {s.isLow && (
                        <span className="ml-1 h-2 w-2 rounded-full bg-[#DC3545] flex-shrink-0" title="Low balance" />
                      )}
                    </Link>
                    {groupActive && (
                      <ul className="ml-4 mt-0.5 space-y-0.5">
                        {[
                          { label: "Overview",  href: `/fund/${s.id}`,           icon: Wallet      },
                          { label: "Claims",    href: `/fund/${s.id}/claims`,    icon: FileText    },
                          { label: "Statement", href: `/fund/${s.id}/statement`, icon: BarChart2   },
                        ].map(sub => {
                          const SubIcon = sub.icon;
                          const subActive = pathname === sub.href;
                          return (
                            <li key={sub.href}>
                              <Link href={sub.href}
                                className={`flex items-center gap-2 rounded-[6px] px-2 py-1 text-xs transition-colors ${subActive ? "bg-[#28A745]/10 text-[#28A745] font-semibold" : "text-avenue-text-muted hover:text-[#28A745]"}`}>
                                <SubIcon size={12} />
                                {sub.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-[#EEEEEE]">
          <form action="/api/auth/signout" method="POST">
            <button className="w-full group flex items-center rounded-[8px] p-2 text-avenue-error hover:bg-red-50 transition-colors">
              <LogOut className="h-5 w-5 flex-shrink-0" />
              <span className="ml-3 font-semibold">Log out</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
