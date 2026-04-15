import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { requireRole, ROLES } from "@/lib/rbac";
import { ProviderNewForm } from "./ProviderNewForm";

export default async function ProviderNewPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/providers" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Add Provider</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">Register a new facility or service provider.</p>
        </div>
      </div>
      <ProviderNewForm />
    </div>
  );
}
