"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, AlertCircle, Lock } from "lucide-react";
import { correctProviderClaimAction } from "./actions";
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

interface IcdOption { code: string; description: string }
interface CptOption { code: string; description: string; averageCost: number; category: string }

interface Line {
  serviceCategory: ClaimLineCategory;
  description: string;
  cptCode: string;
  quantity: number;
  unitCost: number;
}

export interface CorrectionPrefill {
  memberNumber: string;
  memberName: string;
  branchName: string | null;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  dateOfService: string;
  attendingDoctor: string;
  primaryDiagnosisCode: string;
  originalBilled: number;
  currency: string;
  lines: Line[];
}

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo";
const roCls = "w-full border border-[#EEEEEE] bg-[#F7F7F7] rounded-lg px-3 py-2 text-sm text-brand-text-muted";
const labelCls = "text-[11px] font-bold text-brand-text-muted uppercase block mb-1";

const SERVICE_TYPES: ServiceType[] = ["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"];
const BENEFITS: BenefitCategory[] = ["OUTPATIENT", "DENTAL", "OPTICAL", "MATERNITY", "CHRONIC_DISEASE", "MENTAL_HEALTH", "WELLNESS_PREVENTIVE"];
const LINE_CATS: ClaimLineCategory[] = ["CONSULTATION", "LABORATORY", "PHARMACY", "IMAGING", "PROCEDURE", "OTHER"];

export function CorrectClaimForm({
  predecessorClaimId,
  predecessorNumber,
  prefill,
  icdOptions,
  cptOptions,
}: {
  predecessorClaimId: string;
  predecessorNumber: string;
  prefill: CorrectionPrefill;
  icdOptions: IcdOption[];
  cptOptions: CptOption[];
}) {
  const today = new Date().toISOString().split("T")[0];
  const [serviceType, setServiceType] = useState<ServiceType>(prefill.serviceType);
  const [benefitCategory, setBenefitCategory] = useState<BenefitCategory>(prefill.benefitCategory);
  const [dateOfService, setDateOfService] = useState(prefill.dateOfService);
  const [attendingDoctor, setAttendingDoctor] = useState(prefill.attendingDoctor);
  const [diagCode, setDiagCode] = useState(prefill.primaryDiagnosisCode);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>(prefill.lines.length ? prefill.lines : [{ serviceCategory: "CONSULTATION", description: "", cptCode: "", quantity: 1, unitCost: 0 }]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // A stable draft id for THIS correction — the idempotency key, so a double-click /
  // back-refresh replays the same receipt instead of filing a second correction.
  const [draftId] = useState(() => crypto.randomUUID());

  const total = useMemo(() => lines.reduce((s, l) => s + Math.max(1, l.quantity) * (l.unitCost || 0), 0), [lines]);
  const delta = total - prefill.originalBilled;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function applyCpt(i: number, code: string) {
    const hit = cptOptions.find((c) => c.code === code);
    if (hit) {
      updateLine(i, {
        cptCode: hit.code,
        description: lines[i].description || hit.description,
        unitCost: lines[i].unitCost || hit.averageCost,
        serviceCategory: LINE_CATS.includes(hit.category as ClaimLineCategory) ? (hit.category as ClaimLineCategory) : lines[i].serviceCategory,
      });
    } else {
      updateLine(i, { cptCode: code });
    }
  }

  function submit() {
    if (!confirmed || pending) return;
    setError(null);
    const diag = icdOptions.find((d) => d.code === diagCode);
    startTransition(async () => {
      const res = await correctProviderClaimAction({
        predecessorClaimId,
        idempotencyKey: draftId,
        reason: reason.trim() || undefined,
        serviceType,
        benefitCategory,
        dateOfService,
        attendingDoctor: attendingDoctor || undefined,
        primaryDiagnosis: { code: diagCode, description: diag?.description ?? "" },
        lineItems: lines,
      });
      // On success the action redirects; only an error result returns here.
      if (res?.error) {
        setError(res.error);
        if (res.refresh) router.refresh();
      }
    });
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 space-y-6">
      <div className="rounded-lg bg-[#FFF8E1] border border-[#FFC107]/40 px-4 py-3 text-xs text-[#856404]">
        You are filing a <strong>correction</strong> of claim <strong>{predecessorNumber}</strong>. Submitting creates a new claim and
        supersedes the original — the original is kept, unchanged, in your submission history. It is not editable in place.
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm" role="alert">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div>
        <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Patient &amp; encounter</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cf-member" className={labelCls}>Member / card number <Lock size={10} className="inline -mt-0.5" /></label>
            <input id="cf-member" value={prefill.memberNumber} readOnly disabled aria-describedby="cf-member-note" className={roCls} />
            <p id="cf-member-note" className="text-[11px] text-brand-text-muted mt-1">{prefill.memberName} · a correction cannot move the claim to another member.</p>
          </div>
          <div>
            <label htmlFor="cf-branch" className={labelCls}>Branch <Lock size={10} className="inline -mt-0.5" /></label>
            <input id="cf-branch" value={prefill.branchName ?? "—"} readOnly disabled className={roCls} />
          </div>
          <div>
            <label htmlFor="cf-dos" className={labelCls}>Date of service *</label>
            <input id="cf-dos" type="date" max={today} value={dateOfService} onChange={(e) => setDateOfService(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="cf-stype" className={labelCls}>Service type *</label>
            <select id="cf-stype" value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)} className={inputCls}>
              {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cf-benefit" className={labelCls}>Benefit *</label>
            <select id="cf-benefit" value={benefitCategory} onChange={(e) => setBenefitCategory(e.target.value as BenefitCategory)} className={inputCls}>
              {BENEFITS.map((b) => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cf-doctor" className={labelCls}>Attending clinician</label>
            <input id="cf-doctor" value={attendingDoctor} onChange={(e) => setAttendingDoctor(e.target.value)} placeholder="Dr. Name" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="cf-diag" className={labelCls}>Primary diagnosis (ICD-10) *</label>
            <select id="cf-diag" value={diagCode} onChange={(e) => setDiagCode(e.target.value)} className={inputCls}>
              <option value="">Select diagnosis…</option>
              {icdOptions.map((d) => <option key={d.code} value={d.code}>{d.code} — {d.description}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2 mb-4">
          <h3 className="font-bold text-brand-text-heading font-heading">Service lines</h3>
          <button type="button" onClick={() => setLines((p) => [...p, { serviceCategory: "OTHER", description: "", cptCode: "", quantity: 1, unitCost: 0 }])} className="flex items-center gap-1 text-xs font-semibold text-brand-indigo">
            <Plus size={13} /> Add line
          </button>
        </div>
        <datalist id="cf-cpt-list">
          {cptOptions.map((c) => <option key={c.code} value={c.code}>{c.description}</option>)}
        </datalist>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end border border-[#F0F0F0] rounded-lg p-2">
              <div className="col-span-3">
                <label className={labelCls}>Category</label>
                <select aria-label={`Line ${i + 1} category`} value={l.serviceCategory} onChange={(e) => updateLine(i, { serviceCategory: e.target.value as ClaimLineCategory })} className={inputCls}>
                  {LINE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-4">
                <label className={labelCls}>Description *</label>
                <input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Service description" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>CPT</label>
                <input aria-label={`Line ${i + 1} CPT`} list="cf-cpt-list" value={l.cptCode} onChange={(e) => applyCpt(i, e.target.value)} placeholder="e.g. 99213" className={inputCls} />
              </div>
              <div className="col-span-1">
                <label className={labelCls}>Qty</label>
                <input aria-label={`Line ${i + 1} quantity`} type="number" min={1} value={l.quantity} onChange={(e) => updateLine(i, { quantity: parseInt(e.target.value) || 1 })} className={inputCls} />
              </div>
              <div className="col-span-1">
                <label className={labelCls}>Unit</label>
                <input aria-label={`Line ${i + 1} unit cost`} type="number" min={0} value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: parseFloat(e.target.value) || 0 })} className={inputCls} />
              </div>
              <div className="col-span-1 flex justify-end">
                {lines.length > 1 && (
                  <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="p-1.5 text-brand-text-muted hover:text-[#DC3545]"><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-3 mt-2 border-t border-[#EEEEEE]">
          <span className="text-xs font-bold uppercase text-brand-text-muted">Corrected total</span>
          <span className="text-right">
            <span className="text-lg font-bold text-brand-indigo">{prefill.currency} {total.toLocaleString("en-UG")}</span>
            <span className="block text-[11px] text-brand-text-muted">
              was {prefill.currency} {prefill.originalBilled.toLocaleString("en-UG")}
              {delta !== 0 && <> · {delta > 0 ? "+" : "−"}{prefill.currency} {Math.abs(delta).toLocaleString("en-UG")}</>}
            </span>
          </span>
        </div>
      </div>

      <div>
        <label htmlFor="cf-reason" className={labelCls}>Reason for correction (optional)</label>
        <input id="cf-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} placeholder="e.g. corrected a mis-keyed unit cost (no clinical detail)" className={inputCls} />
      </div>

      <label className="flex items-start gap-2 text-sm text-brand-text-body">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        <span>I confirm the member, branch, dates, codes, quantities and charges above are correct for this claim.</span>
      </label>

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending || !confirmed} className="flex items-center gap-2 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2.5 rounded-full font-semibold disabled:opacity-50">
          <Save size={16} /> {pending ? "Submitting correction…" : "Submit correction"}
        </button>
      </div>
    </div>
  );
}
