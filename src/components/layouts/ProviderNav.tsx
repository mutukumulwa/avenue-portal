"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserCheck,
  FileText,
  FilePlus2,
  Banknote,
  KeyRound,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",   href: "/provider/dashboard",   icon: LayoutDashboard },
  { label: "Eligibility", href: "/provider/eligibility", icon: UserCheck       },
  { label: "Claims",      href: "/provider/claims",      icon: FileText        },
  { label: "New Claim",   href: "/provider/claims/new",  icon: FilePlus2       },
  { label: "Settlements", href: "/provider/settlements", icon: Banknote        },
  { label: "API Keys",    href: "/provider/api-keys",    icon: KeyRound        },
];

export function ProviderNav({ providerName }: { providerName: string }) {
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
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
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
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-brand-error hover:bg-red-50 transition-colors"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>
      <div className="md:hidden border-t border-[#EEEEEE] bg-white">
        <div className="overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-stretch gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
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
