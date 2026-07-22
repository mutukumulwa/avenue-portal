"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Save, AlertCircle } from "lucide-react";
import { submitProviderClaimAction } from "./actions";
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

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo";
const labelCls = "text-[11px] font-bold text-brand-text-muted uppercase block mb-1";

const SERVICE_TYPES: ServiceType[] = ["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"];
const BENEFITS: BenefitCategory[] = ["OUTPATIENT", "DENTAL", "OPTICAL", "MATERNITY", "CHRONIC_DISEASE", "MENTAL_HEALTH", "WELLNESS_PREVENTIVE"];
const LINE_CATS: ClaimLineCategory[] = ["CONSULTATION", "LABORATORY", "PHARMACY", "IMAGING", "PROCEDURE", "OTHER"];

export function ProviderClaimForm({
  icdOptions,
  cptOptions,
  prefillMemberNumber,
  prefillMemberName,
}: {
  icdOptions: IcdOption[];
  cptOptions: CptOption[];
  prefillMemberNumber: string;
  prefillMemberName: string;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [memberNumber, setMemberNumber] = useState(prefillMemberNumber);
  const [serviceType, setServiceType] = useState<ServiceType>("OUTPATIENT");
  const [benefitCategory, setBenefitCategory] = useState<BenefitCategory>("OUTPATIENT");
  const [dateOfService, setDateOfService] = useState(today);
  const [attendingDoctor, setAttendingDoctor] = useState("");
  const [diagCode, setDiagCode] = useState("");
  const [lines, setLines] = useState<Line[]>([{ serviceCategory: "CONSULTATION", description: "", cptCode: "", quantity: 1, unitCost: 0 }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // F5.1: a stable draft id for THIS form instance — sent as the idempotency key so
  // a double-click / back-refresh replays the same receipt instead of duplicating.
  const [draftId] = useState(() => crypto.randomUUID());

  const total = useMemo(() => lines.reduce((s, l) => s + Math.max(1, l.quantity) * (l.unitCost || 0), 0), [lines]);

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
        serviceCategory: (LINE_CATS.includes(hit.category as ClaimLineCategory) ? (hit.category as ClaimLineCategory) : lines[i].serviceCategory),
      });
    } else {
      updateLine(i, { cptCode: code });
    }
  }

  function submit() {
    setError(null);
    const diag = icdOptions.find((d) => d.code === diagCode);
    startTransition(async () => {
      const res = await submitProviderClaimAction({
        idempotencyKey: draftId,
        memberNumber,
        serviceType,
        benefitCategory,
        dateOfService,
        attendingDoctor: attendingDoctor || undefined,
        primaryDiagnosis: { code: diagCode, description: diag?.description ?? "" },
        lineItems: lines,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 space-y-6">
      {error && (
        <div className="flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div>
        <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Patient & encounter</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Member / card number *</label>
            <input name="memberNumber" value={memberNumber} onChange={(e) => setMemberNumber(e.target.value)} placeholder="e.g. NWSC-2026-00001" className={inputCls} />
            {prefillMemberName && <p className="text-[11px] text-brand-text-muted mt-1">{prefillMemberName}</p>}
          </div>
          <div>
            <label className={labelCls}>Date of service *</label>
            <input type="date" max={today} value={dateOfService} onChange={(e) => setDateOfService(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Service type *</label>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)} className={inputCls}>
              {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Benefit *</label>
            <select value={benefitCategory} onChange={(e) => setBenefitCategory(e.target.value as BenefitCategory)} className={inputCls}>
              {BENEFITS.map((b) => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Attending clinician</label>
            <input value={attendingDoctor} onChange={(e) => setAttendingDoctor(e.target.value)} placeholder="Dr. Name" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Primary diagnosis (ICD-10) *</label>
            <select value={diagCode} onChange={(e) => setDiagCode(e.target.value)} className={inputCls}>
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
        <datalist id="cpt-list">
          {cptOptions.map((c) => <option key={c.code} value={c.code}>{c.description}</option>)}
        </datalist>
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end border border-[#F0F0F0] rounded-lg p-2">
              <div className="col-span-3">
                <label className={labelCls}>Category</label>
                <select value={l.serviceCategory} onChange={(e) => updateLine(i, { serviceCategory: e.target.value as ClaimLineCategory })} className={inputCls}>
                  {LINE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-span-4">
                <label className={labelCls}>Description *</label>
                <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Service description" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>CPT</label>
                <input list="cpt-list" value={l.cptCode} onChange={(e) => applyCpt(i, e.target.value)} placeholder="e.g. 99213" className={inputCls} />
              </div>
              <div className="col-span-1">
                <label className={labelCls}>Qty</label>
                <input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(i, { quantity: parseInt(e.target.value) || 1 })} className={inputCls} />
              </div>
              <div className="col-span-1">
                <label className={labelCls}>Unit</label>
                <input type="number" min={0} value={l.unitCost} onChange={(e) => updateLine(i, { unitCost: parseFloat(e.target.value) || 0 })} className={inputCls} />
              </div>
              <div className="col-span-1 flex justify-end">
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="p-1.5 text-brand-text-muted hover:text-[#DC3545]"><Trash2 size={14} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-3 mt-2 border-t border-[#EEEEEE]">
          <span className="text-xs font-bold uppercase text-brand-text-muted">Total billed</span>
          <span className="text-lg font-bold text-brand-indigo">UGX {total.toLocaleString("en-UG")}</span>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending} className="flex items-center gap-2 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2.5 rounded-full font-semibold disabled:opacity-50">
          <Save size={16} /> {pending ? "Submitting…" : "Submit claim"}
        </button>
      </div>
    </div>
  );
}
