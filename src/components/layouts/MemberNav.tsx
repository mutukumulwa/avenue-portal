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
  Fingerprint,
  Smartphone,
  WalletCards,
  FileText,
  Bell,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",   href: "/member/dashboard",   icon: LayoutDashboard },
  { label: "My Benefits", href: "/member/benefits",    icon: Shield          },
  { label: "Dependents",  href: "/member/dependents",  icon: Users           },
  { label: "Utilization", href: "/member/utilization", icon: TrendingUp      },
  { label: "Pre-Auth",    href: "/member/preauth",     icon: Stethoscope     },
  { label: "Wallet",      href: "/member/wallet",      icon: WalletCards     },
  { label: "Documents",   href: "/member/documents",   icon: FileText        },
  { label: "Alerts",      href: "/member/notifications", icon: Bell          },
  { label: "Check-In",    href: "/member/check-in",    icon: Fingerprint     },
  { label: "Facilities",  href: "/member/facilities",  icon: Building        },
  { label: "Support",     href: "/member/support",     icon: HelpCircle      },
  { label: "Security",    href: "/member/security",    icon: Smartphone      },
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
        <div className="max-w-5xl mx-auto overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max items-stretch gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-12 w-[76px] flex-col items-center justify-center gap-1 rounded-[8px] px-2 py-1 text-center transition-colors ${
                    active
                      ? "bg-avenue-indigo/10 text-avenue-indigo"
                      : "text-avenue-text-body hover:bg-avenue-bg-alt hover:text-avenue-indigo"
                  }`}
                >
                  <Icon size={18} />
                  <span className="max-w-full truncate text-[10px] font-semibold leading-tight">{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex min-h-12 w-[76px] flex-col items-center justify-center gap-1 rounded-[8px] px-2 py-1 text-center text-avenue-error transition-colors hover:bg-red-50"
            >
              <LogOut size={18} />
              <span className="max-w-full truncate text-[10px] font-semibold leading-tight">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
