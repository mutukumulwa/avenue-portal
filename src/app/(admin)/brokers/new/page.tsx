import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { BrokerForm } from "../BrokerForm";

export default async function NewBrokerPage() {
  await requireRole(ROLES.ADMIN_ONLY);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/brokers" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Add Broker</h1>
          <p className="text-sm text-avenue-text-muted mt-1">Create a broker profile before linking a broker portal user.</p>
        </div>
      </div>
      <BrokerForm />
    </div>
  );
}
