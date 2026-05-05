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
      <div className="flex min-h-screen bg-avenue-bg-alt/30">
        <BrokerSidebar userRole={session.user.role as string} />
        <div className="flex-1 ml-64 p-8">
          {children}
        </div>
      </div>
    );
  });
}
