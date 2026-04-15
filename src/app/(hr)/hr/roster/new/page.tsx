import { requireRole, ROLES } from "@/lib/rbac";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HRAddMemberForm } from "@/app/(hr)/hr/roster/new/HRAddMemberForm";

export default async function HRAddMemberPage() {
  await requireRole(ROLES.HR);
  // We don't need to pass groups because HR is scoped internally

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/hr/roster" className="text-avenue-text-muted hover:text-avenue-text-heading transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Request Member Addition</h1>
          <p className="text-avenue-text-body mt-1 text-sm">Submit an endorsement to enqueue a new member or dependent.</p>
        </div>
      </div>

      <HRAddMemberForm />
    </div>
  );
}
