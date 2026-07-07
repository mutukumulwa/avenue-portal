import { requireRole, ROLES } from "@/lib/rbac";
import { ShieldAlert } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TenantSettingsService } from "@/server/services/tenant-settings.service";
import { saveClaimControlsAction } from "./actions";

export default async function ClaimControlsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error, saved } = await searchParams;
  const settings = await TenantSettingsService.getClaimControls(session.user.tenantId);

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-brand-error" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Claim Money Controls</h1>
          <p className="text-sm text-brand-text-muted">
            The fraud approval gate (OBS-7) stops a claim carrying an unresolved fraud alert from
            becoming <strong>payable</strong> until the alert is cleared — or, when allowed, a
            fraud-clearance approval completes. Declines are never blocked. This is a money control:
            enabling it can hold otherwise-approvable claims, so changes are audited.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-brand-success/30 bg-brand-success/10 px-4 py-3 text-sm text-brand-success">
          Claim controls saved.
        </div>
      )}

      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <form action={saveClaimControlsAction} className="space-y-5">
          <label className="flex items-start gap-3 text-sm text-brand-text-body">
            <input
              type="checkbox"
              name="requireFraudClearanceBeforeApproval"
              defaultChecked={settings.requireFraudClearanceBeforeApproval}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="font-semibold text-brand-text-heading">
                Require fraud clearance before a claim can be approved
              </span>
              <br />
              When off (the default), fraud alerts are advisory only and do not block approval.
            </span>
          </label>

          <div>
            <label className={labelCls} htmlFor="fraudApprovalSeverityThreshold">
              Block at this severity or above
            </label>
            <select
              id="fraudApprovalSeverityThreshold"
              name="fraudApprovalSeverityThreshold"
              className={inputCls}
              defaultValue={settings.fraudApprovalSeverityThreshold}
            >
              <option value="LOW">Low (block on any open alert)</option>
              <option value="MEDIUM">Medium (recommended)</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical only</option>
            </select>
            <p className="mt-1 text-xs text-brand-text-muted">
              Alerts below this severity stay advisory and never freeze a routine claim.
            </p>
          </div>

          <div>
            <label className={labelCls} htmlFor="fraudApprovalGateMode">
              How the gate can be satisfied
            </label>
            <select
              id="fraudApprovalGateMode"
              name="fraudApprovalGateMode"
              className={inputCls}
              defaultValue={settings.fraudApprovalGateMode}
            >
              <option value="CLEAR_ALERT_OR_DUAL_APPROVAL">
                Clear the alert OR complete a fraud-clearance approval (recommended)
              </option>
              <option value="CLEAR_ALERT_ONLY">Clear the alert only</option>
            </select>
            <p className="mt-1 text-xs text-brand-text-muted">
              Fraud alerts are cleared by OPS / fraud / medical roles in the Fraud console — never
              by the claim submitter or ordinary adjudicator.
            </p>
          </div>

          <div className="flex justify-end">
            <SubmitButton>Save controls</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
