"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  UserCheck,
  FileText,
  Layers,
  ShieldCheck,
  FilePlus2,
  Banknote,
  ScrollText,
  BarChart3,
  IdCard,
  Users,
  KeyRound,
  Cable,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import type { ProviderNavIconKey, ProviderNavItemView } from "./provider-nav-model";
import { SignedInIdentity } from "./SignedInIdentity";

// iconKey → component map (icons cannot cross the server→client boundary as
// values, so the server passes a stable string key that we resolve here).
const ICONS: Record<ProviderNavIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  inbox: Inbox,
  eligibility: UserCheck,
  claims: FileText,
  cases: Layers,
  preauth: ShieldCheck,
  "new-claim": FilePlus2,
  settlements: Banknote,
  contracts: ScrollText,
  performance: BarChart3,
  profile: IdCard,
  users: Users,
  "api-keys": KeyRound,
  integrations: Cable,
};

/**
 * F1.4: renders the already permission-filtered nav computed server-side
 * (computeProviderNav). It receives only browser-safe {key,label,href,iconKey}
 * items — never permissions, provider id, or branch scope. Hiding an item is
 * convenience only; every route stays server-authorized.
 */
export function ProviderNav({ providerName, items, actorName, roleLabel }: { providerName: string; items: ProviderNavItemView[]; actorName?: string | null; roleLabel?: string | null }) {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-[#EEEEEE] sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/provider/dashboard" className="flex items-center space-x-2 min-w-0">
          <div className="h-7 w-7 bg-brand-indigo rounded-full shrink-0" />
          <span className="font-bold font-heading text-brand-indigo text-lg shrink-0">Medvex</span>
          <span className="hidden sm:inline text-brand-text-muted text-sm truncate">· {providerName}</span>
        </Link>
        <div className="hidden md:flex items-center gap-1">
          {items.map((item) => {
            const Icon = ICONS[item.iconKey];
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? "bg-brand-indigo/10 text-brand-indigo"
                    : "text-brand-text-body hover:bg-brand-bg-alt hover:text-brand-indigo"
                }`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
          {/* DEF-001/DEF-002: signed-in actor + real persona label (falls back to
              the generic "Provider" when no persona role is resolved) + facility. */}
          <SignedInIdentity variant="bar" name={actorName} role="PROVIDER_USER" roleLabel={roleLabel} subtitle={providerName} />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-brand-error hover:bg-red-50 transition-colors"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>
      {(actorName) && (
        <div className="md:hidden border-t border-[#EEEEEE] bg-white px-4 py-1.5 flex justify-end">
          <SignedInIdentity variant="bar" name={actorName} role="PROVIDER_USER" roleLabel={roleLabel} subtitle={providerName} />
        </div>
      )}
      <div className="md:hidden border-t border-[#EEEEEE] bg-white">
        <div className="min-w-0 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-stretch gap-2">
            {items.map((item) => {
              const Icon = ICONS[item.iconKey];
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-12 w-[80px] flex-col items-center justify-center gap-1 rounded-[8px] px-2 py-1 text-center transition-colors ${
                    active
                      ? "bg-brand-indigo/10 text-brand-indigo"
                      : "text-brand-text-body hover:bg-brand-bg-alt hover:text-brand-indigo"
                  }`}
                >
                  <Icon size={18} />
                  <span className="max-w-full truncate text-[10px] font-semibold leading-tight">{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex min-h-12 w-[80px] flex-col items-center justify-center gap-1 rounded-[8px] px-2 py-1 text-center text-brand-error transition-colors hover:bg-red-50"
            >
              <LogOut size={18} />
              <span className="text-[10px] font-semibold leading-tight">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
