"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  Users,
  TrendingUp,
  Stethoscope,
  Building,
  HelpCircle,
  UserCircle,
  LogOut,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",   href: "/member/dashboard",   icon: LayoutDashboard },
  { label: "My Benefits", href: "/member/benefits",    icon: Shield          },
  { label: "Dependents",  href: "/member/dependents",  icon: Users           },
  { label: "Utilization", href: "/member/utilization", icon: TrendingUp      },
  { label: "Pre-Auth",    href: "/member/preauth",     icon: Stethoscope     },
  { label: "Facilities",  href: "/member/facilities",  icon: Building        },
  { label: "Support",     href: "/member/support",     icon: HelpCircle      },
  { label: "Profile",     href: "/member/profile",     icon: UserCircle      },
];

export function MemberNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-b border-[#EEEEEE] sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/member/dashboard" className="flex items-center space-x-2">
          <div className="h-7 w-7 bg-avenue-indigo rounded-full" />
          <span className="font-bold font-heading text-avenue-indigo text-lg">Avenue Health</span>
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
                    ? "bg-avenue-indigo/10 text-avenue-indigo"
                    : "text-avenue-text-body hover:bg-avenue-bg-alt hover:text-avenue-indigo"
                }`}
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-avenue-error hover:bg-red-50 transition-colors"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>
      <div className="md:hidden border-t border-[#EEEEEE] bg-white">
        <div className="max-w-5xl mx-auto px-2 py-2 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? "bg-avenue-indigo/10 text-avenue-indigo"
                      : "text-avenue-text-body hover:bg-avenue-bg-alt hover:text-avenue-indigo"
                  }`}
                >
                  <Icon size={18} />
                </Link>
              );
            })}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="Logout"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-avenue-error hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
