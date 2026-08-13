import { getCachedSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BrokerSidebar } from "@/components/layouts/BrokerSidebar";
import { measureAsync } from "@/lib/perf";

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  return measureAsync("layout.broker", async () => {
    const session = await getCachedSession();
    if (!session?.user) redirect("/login");
    if (!["BROKER_USER", "SUPER_ADMIN"].includes(session.user.role as string)) redirect("/unauthorized");

    return (
      <div className="flex min-h-screen bg-brand-bg-alt/30">
        <BrokerSidebar userRole={session.user.role as string} userName={session.user.name ?? null} />
        {/* P11.02 (DEF-072): the offset is conditional, or the drawer
              would free the width and this would take it straight back. */}
          <div className="min-w-0 flex-1 p-4 md:ml-64 md:p-8">
          {children}
        </div>
      </div>
    );
  });
}
