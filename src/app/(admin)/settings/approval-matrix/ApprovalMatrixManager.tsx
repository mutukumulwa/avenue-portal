"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, ShieldCheck } from "lucide-react";
import {
  createApprovalMatrixRuleAction,
  toggleApprovalMatrixRuleAction,
  deleteApprovalMatrixRuleAction,
} from "./actions";

const ROLES = [
  { value: "SUPER_ADMIN",      label: "Super Admin" },
  { value: "UNDERWRITER",      label: "Underwriter" },
  { value: "MEDICAL_OFFICER",  label: "Medical Officer" },
  { value: "CLAIMS_OFFICER",   label: "Claims Officer" },
  { value: "FINANCE_OFFICER",  label: "Finance Officer" },
];

const ACTION_TYPES = [
  { value: "CLAIM_PAYMENT",          label: "Claim payment" },
  { value: "PREAUTH_GOP",            label: "Pre-auth / GOP" },
  { value: "LIMIT_OVERRIDE",         label: "Benefit-limit override" },
  { value: "SCHEME_ACTIVATION",      label: "Scheme / binder activation" },
  { value: "COMMISSION_CHANGE",      label: "Commission-rate change" },
  { value: "MEMBER_ENDORSEMENT",     label: "Member endorsement" },
  { value: "PROVIDER_TARIFF_CHANGE", label: "Provider-tariff change" },
  { value: "FUND_TOPUP",             label: "Fund top-up" },
  { value: "WRITEOFF_REFUND",        label: "Write-off / refund" },
];
const actionLabel = (v: string) => ACTION_TYPES.find((a) => a.value === v)?.label ?? v;

const SERVICE_TYPES = ["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"];

const BENEFIT_CATEGORIES = [
  "INPATIENT","OUTPATIENT","MATERNITY","DENTAL","OPTICAL",
  "MENTAL_HEALTH","CHRONIC_DISEASE","SURGICAL","AMBULANCE_EMERGENCY",
  "LAST_EXPENSE","WELLNESS_PREVENTIVE","REHABILITATION","CUSTOM",
];

export interface ApprovalMatrixRuleDTO {
  id: string;
  tenantId: string;
  clientId: string | null;
  clientName: string | null;
  actionType: string;
  currency: string;
  claimValueMin: number | null;
  claimValueMax: number | null;
  serviceType: string | null;
  benefitCategory: string | null;
  requiredRole: string;
  requiresDual: boolean;
  slaMinutes: number | null;
  escalationTargetRole: string | null;
  steps: { level: number; requiredRole: string }[];
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ClientOption { id: string; name: string }
interface Props { rules: ApprovalMatrixRuleDTO[]; clients: ClientOption[] }

export function ApprovalMatrixManager({ rules, clients }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [isPending, start]      = useTransition();

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await createApprovalMatrixRuleAction(fd);
      if (res.error) setError(res.error);
      else { setShowForm(false); (e.target as HTMLFormElement).reset(); }
    });
  }

  function handleToggle(id: string) {
    const fd = new FormData(); fd.set("id", id);
    start(async () => { await toggleApprovalMatrixRuleAction(fd); });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this rule?")) return;
    const fd = new FormData(); fd.set("id", id);
    start(async () => { await deleteApprovalMatrixRuleAction(fd); });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded px-3 py-2">{error}</p>
      )}

      {rules.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Min Value</th>
                <th className="px-4 py-3">Max Value</th>
                <th className="px-4 py-3">Service / Benefit</th>
                <th className="px-4 py-3">Required Role</th>
                <th className="px-4 py-3">Approval / SLA</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {rules.map(r => (
                <tr key={r.id} className={r.isActive ? "hover:bg-[#F8F9FA]" : "bg-[#F8F9FA] opacity-60"}>
                  <td className="px-4 py-3 font-semibold text-brand-text-heading">{actionLabel(r.actionType)}</td>
                  <td className="px-4 py-3 text-brand-text-body">
                    {r.clientName ?? <span className="text-brand-text-muted italic">All clients</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-brand-text-body">
                    {r.claimValueMin ? `${r.currency} ${Number(r.claimValueMin).toLocaleString()}` : <span className="text-brand-text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-brand-text-body">
                    {r.claimValueMax ? `${r.currency} ${Number(r.claimValueMax).toLocaleString()}` : <span className="text-brand-text-muted">Any</span>}
                  </td>
                  <td className="px-4 py-3 text-brand-text-body">
                    {r.serviceType ?? <span className="text-brand-text-muted italic">All</span>}
                    {" / "}
                    {r.benefitCategory ? r.benefitCategory.replace(/_/g, " ") : <span className="text-brand-text-muted italic">All</span>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-brand-text-heading">
                    {r.steps.length > 0
                      ? <span className="text-xs">{r.steps.map(s => `L${s.level} ${ROLES.find(x => x.value === s.requiredRole)?.label ?? s.requiredRole}`).join(" → ")}</span>
                      : (ROLES.find(x => x.value === r.requiredRole)?.label ?? r.requiredRole)}
                  </td>
                  <td className="px-4 py-3">
                    {r.requiresDual
                      ? <span className="flex items-center gap-1 text-[#856404] text-xs font-bold"><ShieldCheck size={12} /> Dual</span>
                      : <span className="text-brand-text-muted text-xs">Single</span>}
                    {r.slaMinutes ? <span className="block text-[10px] text-brand-text-muted">SLA {r.slaMinutes}m{r.escalationTargetRole ? ` → ${r.escalationTargetRole.replace(/_/g, " ")}` : ""}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.isActive ? "bg-[#28A745]/10 text-[#28A745]" : "bg-[#6C757D]/10 text-[#6C757D]"}`}>
                      {r.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => handleToggle(r.id)} disabled={isPending} className="text-brand-text-muted hover:text-brand-indigo disabled:opacity-50 transition-colors">
                        {r.isActive ? <ToggleRight size={18} className="text-[#28A745]" /> : <ToggleLeft size={18} />}
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={isPending} className="text-brand-text-muted hover:text-[#DC3545] disabled:opacity-50 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rules.length === 0 && !showForm && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-8 text-center text-sm text-brand-text-muted shadow-sm">
          No approval rules configured. All roles can currently approve any claim value.
        </div>
      )}

      {showForm ? (
        <form onSubmit={handleCreate} className="bg-white border border-brand-indigo/20 rounded-[8px] p-5 shadow-sm space-y-4">
          <p className="text-sm font-bold text-brand-text-heading">New Approval Rule</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Action Type</label>
              <select name="actionType" defaultValue="CLAIM_PAYMENT" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo">
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Client Scope</label>
              <select name="clientId" defaultValue="" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo">
                <option value="">All clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Currency</label>
              <input name="currency" defaultValue="UGX" maxLength={3}
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm uppercase outline-none focus:border-brand-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Min Value</label>
              <input name="claimValueMin" type="number" min="0" placeholder="No minimum"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Max Value</label>
              <input name="claimValueMax" type="number" min="0" placeholder="No maximum"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Required Role</label>
              <select name="requiredRole" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo">
                <option value="">Select role…</option>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Service Type (optional)</label>
              <select name="serviceType" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo">
                <option value="">All service types</option>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Benefit Category (optional)</label>
              <select name="benefitCategory" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo">
                <option value="">All categories</option>
                {BENEFIT_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Dual Approval Required</label>
              <select name="requiresDual" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo">
                <option value="false">No</option>
                <option value="true">Yes — two approvers needed</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">SLA (minutes, optional)</label>
              <input name="slaMinutes" type="number" min="0" placeholder="e.g. 30"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Escalate To (optional)</label>
              <select name="escalationTargetRole" defaultValue="" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo">
                <option value="">No escalation</option>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="space-y-1 md:col-span-3">
              <label className="text-xs font-semibold text-brand-text-muted uppercase">Sequential Levels (optional)</label>
              <input name="stepRoles" placeholder="Comma-separated roles for multi-level approval, e.g. CLAIMS_OFFICER, FINANCE_OFFICER"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-brand-indigo" />
              <p className="text-[10px] text-brand-text-muted">Leave blank for single-level (uses Required Role). Each role becomes a sequential approval level with enforced maker≠checker.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)}
              className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending}
              className="text-xs font-bold px-5 py-2 rounded-full bg-brand-indigo text-white hover:bg-brand-secondary disabled:opacity-50 transition-colors">
              {isPending ? "Saving…" : "Add Rule"}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border-2 border-dashed border-brand-indigo/30 text-brand-indigo hover:bg-brand-indigo/5 transition-colors">
          <Plus size={13} /> Add Approval Rule
        </button>
      )}
    </div>
  );
}
