import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BrokerSidebar } from "@/components/layouts/BrokerSidebar";

export default async function BrokerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-avenue-bg-alt/30">
      <BrokerSidebar userRole={session.user.role as string} />
      <div className="flex-1 ml-64 p-8">
        {children}
      </div>
    </div>
  );
}
