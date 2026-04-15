import Link from "next/link";
import { LayoutDashboard, Shield, Users, TrendingUp, Stethoscope, Building, HelpCircle, UserCircle } from "lucide-react";

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
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-avenue-text-body hover:bg-avenue-bg-alt hover:text-avenue-indigo transition-colors"
              >
                <Icon size={15} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
