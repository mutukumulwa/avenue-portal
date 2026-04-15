import { BrokerSidebar } from "@/components/layouts/BrokerSidebar";

export default function BrokerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-avenue-bg-alt/30">
      <BrokerSidebar />
      <div className="flex-1 ml-64 p-8">
        {children}
      </div>
    </div>
  );
}
