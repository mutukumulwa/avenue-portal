"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Users, Building2, FileText, BriefcaseMedical,
  Receipt, CreditCard, Building, PieChart,
  Settings, LogOut, Calculator, UserCheck, MessageSquareText,
  ShieldAlert, MessageSquareWarning, Wallet, Fingerprint,
  BarChart3, TriangleAlert, Landmark, ClipboardCheck, CloudOff,
  ShieldCheck, Lock, FileSignature, Globe2, HeartPulse, KeyRound,
  UserPlus, Scale, Banknote,
} from "lucide-react";
import { PortalSwitcher } from "./PortalSwitcher";
import { useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";

type SubItem = { label: string; href: string };
type NavItem  = { label: string; href: string; icon: React.ElementType; roles: UserRole[]; children?: SubItem[] };
type NavGroup = { label: string; items: NavItem[] };

const ANY_STAFF:    UserRole[] = ["SUPER_ADMIN","CLAIMS_OFFICER","FINANCE_OFFICER","UNDERWRITER","CUSTOMER_SERVICE","MEDICAL_OFFICER","REPORTS_VIEWER"];
const OPS:          UserRole[] = ["SUPER_ADMIN","CLAIMS_OFFICER","MEDICAL_OFFICER","CUSTOMER_SERVICE","UNDERWRITER"];
const FINANCE:      UserRole[] = ["SUPER_ADMIN","FINANCE_OFFICER"];
const FUND_PORTAL:  UserRole[] = ["SUPER_ADMIN"];
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
      { label: "Clients",      href: "/clients",      icon: Landmark,         roles: ADMIN_ONLY   },
      { label: "Groups",       href: "/groups",       icon: Building2,        roles: OPS          },
      { label: "Members",      href: "/members",      icon: Users,            roles: OPS          },
      { label: "Onboarding Queue", href: "/onboarding-queue", icon: UserPlus,     roles: OPS          },
      { label: "Endorsements", href: "/endorsements", icon: FileText,         roles: OPS          },
      { label: "Packages",     href: "/packages",     icon: BriefcaseMedical, roles: UNDERWRITING },
    ],
  },
  {
    label: "Clinical",
    items: [
      // Case management sub-menu (WP-D3): claims are worked clinically — an
      // open case accrues services/PAs/LOUs and files as a single claim.
      {
        label: "Case Management", href: "/cases", icon: Receipt, roles: OPS,
        children: [
          { label: "Open Cases",              href: "/cases"          },
          { label: "All Claims",              href: "/claims"         },
          { label: "Claims Queues",           href: "/claims/queues"  },
          { label: "Pre-Authorizations",      href: "/preauth"        },
          { label: "Letters of Undertaking",  href: "/lou"            },
        ],
      },
      { label: "Offline Capture",    href: "/offline-capture",    icon: CloudOff,       roles: OPS        },
      { label: "Offline Work Codes", href: "/offline-auth",       icon: KeyRound,       roles: OPS        },
      { label: "Approvals",          href: "/approvals",          icon: ClipboardCheck, roles: OPS        },
      { label: "Assessor Queue",     href: "/assessor-queue",     icon: Scale,          roles: UNDERWRITING },
      { label: "Override Queue",     href: "/overrides",          icon: TriangleAlert,  roles: OPS        },
      { label: "Cross-Border Care",  href: "/cross-border",       icon: Globe2,         roles: OPS        },
      { label: "Wellness",           href: "/wellness",           icon: HeartPulse,     roles: OPS        },
      { label: "Exceptions",         href: "/settings/exceptions",icon: TriangleAlert,  roles: OPS        },
      { label: "Secure Check-Ins",   href: "/check-ins",          icon: Fingerprint,    roles: OPS        },
      { label: "Providers",          href: "/providers",          icon: Building,       roles: ADMIN_ONLY },
      { label: "Contracts",          href: "/contracts",          icon: FileSignature,  roles: UNDERWRITING },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Billing & Invoices",  href: "/billing",           icon: CreditCard, roles: FINANCE      },
      { label: "TPA Admin Fees",      href: "/billing/admin-fees", icon: Landmark,  roles: ADMIN_ONLY   },
      { label: "General Ledger",      href: "/billing/gl",        icon: FileText,   roles: FINANCE      },
      { label: "Account Ledger",      href: "/billing/gl/ledger", icon: FileText,   roles: FINANCE      },
      { label: "Self-Funded Schemes", href: "/fund/dashboard",    icon: Wallet,     roles: FUND_PORTAL  },
      { label: "Brokers",             href: "/brokers",           icon: UserCheck,  roles: ADMIN_ONLY   },
      { label: "Quotations",          href: "/quotations",        icon: Calculator, roles: UNDERWRITING },
      { label: "Provider Settlements", href: "/settlement",       icon: Banknote,   roles: FINANCE      },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Strategic Purchasing", href: "/analytics", icon: BarChart3, roles: ANY_STAFF },
      { label: "Reports",              href: "/reports",   icon: PieChart,  roles: ANY_STAFF },
    ],
  },
  {
    label: "Compliance",
    items: [
      { label: "Compliance Register", href: "/compliance",         icon: ShieldCheck, roles: ADMIN_ONLY },
      { label: "Data Protection",     href: "/compliance/privacy", icon: Lock,        roles: ADMIN_ONLY },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Service Requests", href: "/service-requests", icon: MessageSquareText,    roles: OPS },
      { label: "Complaints",       href: "/complaints",        icon: MessageSquareWarning, roles: OPS },
      {
        label: "Fraud Alerts", href: "/fraud", icon: ShieldAlert, roles: OPS,
        children: [
          { label: "Claim Alerts",    href: "/fraud"                },
          { label: "Investigations",  href: "/fraud/investigations" },
          { label: "Rules",           href: "/fraud/rules"          },
          { label: "Check-In Audit",  href: "/fraud/check-ins"      },
        ],
      },
    ],
  },
  {
    label: "Reinstatements",
    items: [
      { label: "Reinstatement Queue", href: "/members/reinstatement", icon: Users, roles: OPS },
    ],
  },
];

const SETUP_SUB: SubItem[] = [
  { label: "Users & Access",    href: "/settings"                    },
  { label: "Approval Matrix",   href: "/settings/approval-matrix"    },
  { label: "Auto-Adjudication", href: "/settings/auto-adjudication"  },
  { label: "Drug Exclusions",   href: "/settings/drug-exclusions"    },
  { label: "Terminology",       href: "/settings/terminology"        },
  { label: "FX Rates",          href: "/settings/fx-rates"           },
  { label: "Security (2FA)",    href: "/settings/security"           },
  { label: "Pricing Models",    href: "/settings/pricing-models"     },
  { label: "Audit Log",         href: "/settings/audit-log"          },
];

// ── Active-route resolution ──────────────────────────────────────────────────
// The sidebar highlights by GLOBAL best match: among every item, child, and
// setup href, the longest one that prefix-matches the pathname wins. This keeps
// exactly one entry lit (detail pages included: /claims/123 → "All Claims",
// /claims/queues → "Claims Queues") and lets a parent like Case Management own
// children on foreign prefixes (/claims, /preauth, /lou) without collapsing.

function hrefMatches(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

function resolveBestMatch(pathname: string): string | null {
  const candidates: string[] = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      candidates.push(item.href);
      for (const child of item.children ?? []) candidates.push(child.href);
    }
  }
  for (const sub of SETUP_SUB) candidates.push(sub.href);
  let best: string | null = null;
  for (const href of candidates) {
    if (hrefMatches(href, pathname) && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}

function itemIsActive(item: NavItem, bestMatch: string | null): boolean {
  if (!bestMatch) return false;
  return item.href === bestMatch || (item.children ?? []).some(c => c.href === bestMatch);
}

function SubItems({ items, bestMatch }: { items: SubItem[]; bestMatch: string | null }) {
  return (
    <ul className="ml-6 mt-0.5 mb-1 space-y-0.5 border-l border-[#EEEEEE] pl-3">
      {items.map(item => {
        const active = item.href === bestMatch;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex items-center rounded-[6px] px-2 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-brand-indigo/10 text-brand-indigo"
                  : "text-brand-text-muted hover:text-brand-indigo hover:bg-brand-bg-alt"
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

function NavItemRow({ item, bestMatch }: { item: NavItem; bestMatch: string | null }) {
  const Icon = item.icon;
  const isActive = itemIsActive(item, bestMatch);
  const hasChildren = !!item.children?.length;

  return (
    <>
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
      {hasChildren && isActive && (
        <SubItems items={item.children!} bestMatch={bestMatch} />
      )}
    </>
  );
}

function NavGroupSection({ group, bestMatch }: { group: NavGroup; bestMatch: string | null }) {
  const isAnyActive = group.items.some(item => itemIsActive(item, bestMatch));
  const [open, setOpen] = useState(isAnyActive || group.label === "Overview");

  // Navigating into a section always reveals it — a page must never render
  // with its own sidebar hierarchy collapsed. Manual toggles stay respected
  // otherwise (we only ever auto-open, never auto-close).
  useEffect(() => {
    if (isAnyActive) setOpen(true);
  }, [isAnyActive]);

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase text-brand-text-muted hover:text-brand-text-heading transition-colors"
        style={{ letterSpacing: 0 }}
      >
        {group.label}
        <span className="text-[10px]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <ul className="space-y-0.5 mb-2">
          {group.items.map(item => (
            <NavItemRow key={item.href} item={item} bestMatch={bestMatch} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminSidebar({ userRole }: { userRole: UserRole | null }) {
  const pathname = usePathname();
  const bestMatch = resolveBestMatch(pathname);
  // Setup lights up only when the best match is one of ITS sub-routes — so
  // /settings/exceptions (a Clinical entry) no longer double-highlights here.
  const setupActive = bestMatch !== null && SETUP_SUB.some(s => s.href === bestMatch);

  const visibleGroups = NAV_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item =>
        !userRole || item.roles.includes(userRole)
      ),
    }))
    .filter(group => group.items.length > 0);

  const showSetup = !userRole || ADMIN_ONLY.includes(userRole);

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-60 border-r border-[#EEEEEE] bg-white">
      <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
        {/* Logo */}
        <Link href="/dashboard" className="mb-5 flex items-center pl-1 space-x-2">
          <div className="h-8 w-8 bg-brand-indigo rounded-full shrink-0" />
          <span className="text-lg font-bold font-heading text-brand-indigo leading-tight" style={{ letterSpacing: 0 }}>
            Medvex<br />
            <span className="text-xs font-semibold text-brand-text-muted font-body">TPA Platform</span>
          </span>
        </Link>

        {/* Portal switcher */}
        {userRole && <PortalSwitcher userRole={userRole} />}

        {/* Nav groups */}
        <nav className="flex-1 space-y-1">
          {visibleGroups.map(group => (
            <NavGroupSection key={group.label} group={group} bestMatch={bestMatch} />
          ))}
        </nav>

        {/* Bottom — superuser setup area */}
        <div className="pt-3 border-t border-[#EEEEEE] space-y-0.5">
          {showSetup && (
            <>
              <Link
                href="/settings"
                className={`group flex items-center rounded-[8px] px-2 py-2 transition-colors ${
                  setupActive
                    ? "bg-brand-indigo/10 text-brand-indigo"
                    : "text-brand-text-body hover:bg-brand-bg-alt hover:text-brand-indigo"
                }`}
              >
                <Settings className={`h-4 w-4 shrink-0 ${setupActive ? "text-brand-indigo" : "text-brand-text-muted group-hover:text-brand-indigo"}`} />
                <span className="ml-2.5 text-sm font-semibold">Setup</span>
              </Link>
              {setupActive && (
                <SubItems items={SETUP_SUB} bestMatch={bestMatch} />
              )}
            </>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full group flex items-center rounded-[8px] px-2 py-2 text-brand-error hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="ml-2.5 text-sm font-semibold">Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
