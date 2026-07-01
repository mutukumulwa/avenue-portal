import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ClientsService } from "@/server/services/clients.service";
import { ApprovalMatrixManager } from "./ApprovalMatrixManager";

export default async function ApprovalMatrixPage() {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const [rules, clients] = await Promise.all([
    prisma.approvalMatrix.findMany({
      where: { tenantId: session.user.tenantId },
      include: { client: { select: { name: true } } },
      orderBy: [{ actionType: "asc" }, { claimValueMin: "asc" }, { serviceType: "asc" }],
    }),
    ClientsService.list(session.user.tenantId),
  ]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Approval Matrix</h1>
        <p className="text-brand-text-body text-sm mt-1">
          Govern which role must approve each action type at which amount band —
          per client, currency-normalised, with SLA/escalation. Rules resolve
          most-specific first; a client-specific rule beats an all-clients one.
        </p>
      </div>
      <ApprovalMatrixManager
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        rules={rules.map((rule) => ({
          id: rule.id,
          tenantId: rule.tenantId,
          clientId: rule.clientId,
          clientName: rule.client?.name ?? null,
          actionType: rule.actionType,
          currency: rule.currency,
          claimValueMin: rule.claimValueMin === null ? null : Number(rule.claimValueMin),
          claimValueMax: rule.claimValueMax === null ? null : Number(rule.claimValueMax),
          serviceType: rule.serviceType,
          benefitCategory: rule.benefitCategory,
          requiredRole: rule.requiredRole,
          requiresDual: rule.requiresDual,
          slaMinutes: rule.slaMinutes,
          escalationTargetRole: rule.escalationTargetRole,
          effectiveFrom: rule.effectiveFrom.toISOString(),
          effectiveTo: rule.effectiveTo?.toISOString() ?? null,
          isActive: rule.isActive,
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
