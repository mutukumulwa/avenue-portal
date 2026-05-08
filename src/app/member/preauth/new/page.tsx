import { requireRole, ROLES } from "@/lib/rbac";
import { MemberPreAuthService } from "@/server/services/member-preauth.service";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberPreAuthForm } from "./MemberPreAuthForm";

export default async function NewMemberPreAuthPage() {
  const session = await requireRole(ROLES.MEMBER);
  const options = await MemberPreAuthService.getRequestOptions(session.user.id, session.user.tenantId);

  if (!options) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/member/preauth" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-avenue-indigo hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to pre-authorizations
        </Link>
        <h1 className="font-heading text-2xl font-bold text-avenue-text-heading">Request Pre-Authorization</h1>
        <p className="mt-1 text-avenue-text-muted">
          Common low-risk services may be decided instantly. Other requests are sent to a reviewer.
        </p>
      </div>
      <MemberPreAuthForm options={options} />
    </div>
  );
}
