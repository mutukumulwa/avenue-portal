import Link from "next/link";
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

const NAV_ITEMS = [
  { label: "Dashboard", href: "/broker/dashboard", icon: LayoutDashboard },
  { label: "My Groups", href: "/broker/groups", icon: Building2 },
  { label: "Submissions", href: "/broker/submissions", icon: FileText },
  { label: "Quotations", href: "/broker/quotations", icon: Calculator },
  { label: "Commissions", href: "/broker/commissions", icon: DollarSign },
  { label: "Renewals", href: "/broker/renewals", icon: RefreshCw },
  { label: "Support", href: "/broker/support", icon: HelpCircle },
];

export function BrokerSidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-[#EEEEEE] bg-white transition-transform">
      <div className="flex h-full flex-col overflow-y-auto px-3 py-4">
        <Link href="/broker/dashboard" className="mb-6 flex items-center pl-2.5 space-x-2">
          <div className="h-8 w-8 bg-avenue-indigo rounded-full" />
          <span className="self-center whitespace-nowrap text-xl font-bold font-heading text-avenue-indigo tracking-tight">
            AiCare | Broker
          </span>
        </Link>
        <ul className="space-y-1.5 font-medium">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group flex items-center rounded-[8px] p-2 text-avenue-text-body hover:bg-avenue-bg-alt hover:text-avenue-indigo transition-colors"
                >
                  <Icon className="h-5 w-5 flex-shrink-0 transition-colors group-hover:text-avenue-indigo text-avenue-text-muted" />
                  <span className="ml-3 font-semibold">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto pt-4 border-t border-[#EEEEEE]">
          <button className="w-full group flex items-center rounded-[8px] p-2 text-avenue-error hover:bg-red-50 transition-colors">
            <LogOut className="h-5 w-5 flex-shrink-0" />
            <span className="ml-3 font-semibold">Log out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
