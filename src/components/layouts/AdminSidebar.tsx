"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Users, Building2, FileText, BriefcaseMedical,
  Stethoscope, Receipt, CreditCard, Building, PieChart,
  Settings, LogOut, Calculator, UserCheck, MessageSquareText,
  ShieldAlert, MessageSquareWarning, Wallet,
} from "lucide-react";
import { PortalSwitcher } from "./PortalSwitcher";
import { useState } from "react";
import type { UserRole } from "@prisma/client";

type SubItem = { label: string; href: string };
type NavItem  = { label: string; href: string; icon: React.ElementType; roles: UserRole[]; children?: SubItem[] };
type NavGroup = { label: string; items: NavItem[] };

const ANY_STAFF: UserRole[] = ["SUPER_ADMIN","CLAIMS_OFFICER","FINANCE_OFFICER","UNDERWRITER","CUSTOMER_SERVICE","MEDICAL_OFFICER","REPORTS_VIEWER"];
const OPS:       UserRole[] = ["SUPER_ADMIN","CLAIMS_OFFICER","MEDICAL_OFFICER","CUSTOMER_SERVICE","UNDERWRITER"];
const CLINICAL:  UserRole[] = ["SUPER_ADMIN","CLAIMS_OFFICER","MEDICAL_OFFICER"];
const FINANCE:   UserRole[] = ["SUPER_ADMIN","FINANCE_OFFICER"];
const UNDERWRITING: UserRole[] = ["SUPER_ADMIN","UNDERWRITER"];
const ADMIN_ONLY:   UserRole[] = ["SUPER_ADMIN"];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ANY_STAFF },
    ],
  },
  {
    label: "Membership",
    items: [
      { label: "Groups",       href: "/groups",       icon: Building2,        roles: OPS          },
      { label: "Members",      href: "/members",      icon: Users,            roles: OPS          },
      { label: "Endorsements", href: "/endorsements", icon: FileText,         roles: OPS          },
      { label: "Packages",     href: "/packages",     icon: BriefcaseMedical, roles: UNDERWRITING },
    ],
  },
  {
    label: "Clinical",
    items: [
      { label: "Claims",             href: "/claims",    icon: Receipt,     roles: CLINICAL   },
      { label: "Pre-Authorizations", href: "/preauth",   icon: Stethoscope, roles: CLINICAL   },
      { label: "Providers",          href: "/providers", icon: Building,    roles: ADMIN_ONLY },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        label: "Billing", href: "/billing", icon: CreditCard, roles: FINANCE,
        children: [
          { label: "Invoices & Payments", href: "/billing"           },
          { label: "General Ledger",      href: "/billing/gl"        },
          { label: "Account Ledger",      href: "/billing/gl/ledger" },
        ],
      },
      { label: "Self-Funded Schemes", href: "/fund/dashboard", icon: Wallet,     roles: FINANCE      },
      { label: "Brokers",             href: "/brokers",        icon: UserCheck,  roles: ADMIN_ONLY   },
      { label: "Quotations",          href: "/quotations",     icon: Calculator, roles: UNDERWRITING },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", href: "/reports", icon: PieChart, roles: ANY_STAFF },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Service Requests", href: "/service-requests", icon: MessageSquareText,    roles: OPS },
      { label: "Complaints",       href: "/complaints",        icon: MessageSquareWarning, roles: OPS },
      { label: "Fraud Alerts",     href: "/fraud",             icon: ShieldAlert,          roles: OPS },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Settings", href: "/settings", icon: Settings, roles: ADMIN_ONLY },
    ],
  },
];

function SubItems({ items, pathname }: { items: SubItem[]; pathname: string }) {
  return (
    <ul className="ml-6 mt-0.5 mb-1 space-y-0.5 border-l border-[#EEEEEE] pl-3">
      {items.map(item => {
        const active = pathname === item.href;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex items-center rounded-[6px] px-2 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-avenue-indigo/10 text-avenue-indigo"
                  : "text-avenue-text-muted hover:text-avenue-indigo hover:bg-avenue-bg-alt"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NavItemRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const hasChildren = !!item.children?.length;

  return (
    <>
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
      {hasChildren && isActive && (
        <SubItems items={item.children!} pathname={pathname} />
      )}
    </>
  );
}

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  const isAnyActive = group.items.some(
    item => pathname === item.href || pathname.startsWith(item.href + "/")
  );
  const [open, setOpen] = useState(isAnyActive || group.label === "Overview");

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-avenue-text-muted hover:text-avenue-text-heading transition-colors"
      >
        {group.label}
        <span className="text-[10px]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <ul className="space-y-0.5 mb-2">
          {group.items.map(item => (
            <NavItemRow key={item.href} item={item} pathname={pathname} />
          ))}
        </ul>
      )}
    </div>
  );
}

const SETTINGS_SUB: SubItem[] = [
  { label: "General",    href: "/settings"            },
  { label: "Exceptions", href: "/settings/exceptions" },
  { label: "Audit Log",  href: "/settings/audit-log"  },
];

export function AdminSidebar({ userRole }: { userRole: UserRole | null }) {
  const pathname = usePathname();
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");

  const visibleGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        !userRole || item.roles.includes(userRole)
      ),
    }))
    .filter(group => group.items.length > 0);

  const showSettings = !userRole || ADMIN_ONLY.includes(userRole);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 border-r border-[#EEEEEE] bg-white">
      <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
        {/* Logo */}
        <Link href="/dashboard" className="mb-5 flex items-center pl-1 space-x-2">
          <div className="h-8 w-8 bg-avenue-indigo rounded-full shrink-0" />
          <span className="text-lg font-bold font-heading text-avenue-indigo tracking-tight leading-tight">
            AiCare<br />
            <span className="text-xs font-semibold text-avenue-text-muted font-body tracking-normal">Avenue Healthcare</span>
          </span>
        </Link>

        {/* Portal switcher */}
        {userRole && <PortalSwitcher userRole={userRole} />}

        {/* Nav groups */}
        <nav className="flex-1 space-y-1">
          {visibleGroups.map(group => (
            <NavGroupSection key={group.label} group={group} pathname={pathname} />
          ))}
        </nav>

        {/* Bottom */}
        <div className="pt-3 border-t border-[#EEEEEE] space-y-0.5">
          {showSettings && (
            <>
              <Link
                href="/settings"
                className={`group flex items-center rounded-[8px] px-2 py-2 transition-colors ${
                  settingsActive
                    ? "bg-avenue-indigo/10 text-avenue-indigo"
                    : "text-avenue-text-body hover:bg-avenue-bg-alt hover:text-avenue-indigo"
                }`}
              >
                <Settings className={`h-4 w-4 shrink-0 ${settingsActive ? "text-avenue-indigo" : "text-avenue-text-muted group-hover:text-avenue-indigo"}`} />
                <span className="ml-2.5 text-sm font-semibold">Settings</span>
              </Link>
              {settingsActive && (
                <SubItems items={SETTINGS_SUB} pathname={pathname} />
              )}
            </>
          )}
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
