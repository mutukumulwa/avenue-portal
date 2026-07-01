import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ApprovalMatrixService } from "@/server/services/approval-matrix.service";
import { decideApprovalAction } from "./actions";
import { ClipboardCheck } from "lucide-react";

const ACTION_LABEL: Record<string, string> = {
  CLAIM_PAYMENT: "Claim payment",
  PREAUTH_GOP: "Pre-auth / GOP",
  LIMIT_OVERRIDE: "Benefit-limit override",
  SCHEME_ACTIVATION: "Scheme activation",
  COMMISSION_CHANGE: "Commission change",
  MEMBER_ENDORSEMENT: "Member endorsement",
  PROVIDER_TARIFF_CHANGE: "Provider-tariff change",
  FUND_TOPUP: "Fund top-up",
  WRITEOFF_REFUND: "Write-off / refund",
};

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { error } = await searchParams;

  const requests = await prisma.approvalRequest.findMany({
    where: { tenantId: session.user.tenantId, status: { in: ["PENDING", "ESCALATED"] } },
    include: {
      client: { select: { name: true } },
      matrix: { include: { steps: true } },
      decisions: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Approvals</h1>
          <p className="text-sm text-brand-text-muted">
            Pending multi-level authorizations. Each level needs a distinct
            approver (maker ≠ checker); levels are actioned in sequence.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-lg border border-brand-border bg-brand-bg p-12 text-center text-sm text-brand-text-muted">
          No approvals awaiting action.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const steps = r.matrix ? ApprovalMatrixService.expandSteps(r.matrix) : [];
            const step = steps.find((s) => s.level === r.currentLevel);
            return (
              <div key={r.id} className="rounded-lg border border-brand-border bg-brand-bg px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm">
                    <div className="font-medium text-brand-text-heading">
                      {ACTION_LABEL[r.actionType] ?? r.actionType}
                      {r.status === "ESCALATED" && (
                        <span className="ml-2 rounded-full bg-brand-pink/15 px-2 py-0.5 text-xs font-medium text-brand-error">Escalated</span>
                      )}
                    </div>
                    <div className="text-xs text-brand-text-muted">
                      {r.entityType} · {r.entityId.slice(0, 8)}
                      {r.amount != null ? ` · ${r.currency} ${Number(r.amount).toLocaleString()}` : ""}
                      {r.client ? ` · ${r.client.name}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-brand-text-body">
                      Level {r.currentLevel} of {steps.length || 1}
                      {step ? ` — needs ${step.requiredRole.replace(/_/g, " ")}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={decideApprovalAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="decision" value="APPROVED" />
                      <button className="rounded-full bg-brand-success px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                        Approve L{r.currentLevel}
                      </button>
                    </form>
                    <form action={decideApprovalAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <input type="hidden" name="decision" value="REJECTED" />
                      <button className="rounded-full border border-brand-border px-3 py-1.5 text-xs font-semibold text-brand-error hover:bg-brand-bg-alt">
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
