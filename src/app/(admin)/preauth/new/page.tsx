import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { MembersService } from "@/server/services/members.service";
import { ProvidersService } from "@/server/services/providers.service";
import { requireRole, ROLES } from "@/lib/rbac";
import { PreAuthNewForm } from "./PreAuthNewForm";

export default async function NewPreAuthPage() {
  const session = await requireRole(ROLES.CLINICAL);

  const tenantId = session.user.tenantId;
  const [members, providers] = await Promise.all([
    MembersService.getMembers(tenantId),
    ProvidersService.getProviders(tenantId),
  ]);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/preauth" className="text-avenue-text-body hover:text-avenue-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Submit Pre-Authorization</h1>
          <p className="text-avenue-text-body font-body mt-1 text-sm">Request approval for a planned medical procedure.</p>
        </div>
      </div>
      <PreAuthNewForm members={members} providers={providers} />
    </div>
  );
}
