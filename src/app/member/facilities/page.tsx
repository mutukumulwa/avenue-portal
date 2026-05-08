import { requireRole, ROLES } from "@/lib/rbac";
import { FacilitiesMap } from "./FacilitiesMap";

export default async function MemberFacilitiesPage() {
  // Ensure the user is logged in as a MEMBER
  await requireRole(ROLES.MEMBER);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">Find Care</h1>
        <p className="text-avenue-text-muted mt-1">Find active facilities near you and preview what a common visit may cost.</p>
      </div>

      <FacilitiesMap />
    </div>
  );
}
