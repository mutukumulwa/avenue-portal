import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ApprovalMatrixManager } from "./ApprovalMatrixManager";

export default async function ApprovalMatrixPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const rules = await prisma.approvalMatrix.findMany({
    where: { tenantId: session.user.tenantId },
    orderBy: [{ claimValueMin: "asc" }, { serviceType: "asc" }],
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Approval Matrix</h1>
        <p className="text-avenue-text-body text-sm mt-1">
          Define which role must approve a claim based on its value, service type, or benefit category.
          Rules are evaluated from most specific to least specific — the first match applies.
        </p>
      </div>
      <ApprovalMatrixManager rules={rules} />
    </div>
  );
}
