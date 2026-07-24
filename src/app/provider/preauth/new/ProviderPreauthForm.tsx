"use client";

import { useState, useTransition } from "react";
import { Save, AlertCircle } from "lucide-react";
import { submitProviderPreauthAction } from "./actions";
import type { ServiceType, BenefitCategory } from "@prisma/client";

interface IcdOption { code: string; description: string }
interface CptOption { code: string; description: string; averageCost: number }

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo";
const labelCls = "text-[11px] font-bold text-brand-text-muted uppercase block mb-1";

const SERVICE_TYPES: ServiceType[] = ["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"];
const BENEFITS: BenefitCategory[] = ["OUTPATIENT", "INPATIENT", "DENTAL", "OPTICAL", "MATERNITY", "SURGICAL", "CHRONIC_DISEASE", "MENTAL_HEALTH", "WELLNESS_PREVENTIVE"];

export function ProviderPreauthForm({
  icdOptions,
  cptOptions,
  prefillMemberNumber,
}: {
  icdOptions: IcdOption[];
  cptOptions: CptOption[];
  prefillMemberNumber: string;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [memberNumber, setMemberNumber] = useState(prefillMemberNumber);
  const [serviceType, setServiceType] = useState<ServiceType>("OUTPATIENT");
  const [benefitCategory, setBenefitCategory] = useState<BenefitCategory>("OUTPATIENT");
  const [expectedDate, setExpectedDate] = useState(today);
  const [diagCode, setDiagCode] = useState("");
  const [diagDesc, setDiagDesc] = useState("");
  const [procCode, setProcCode] = useState("");
  const [procDesc, setProcDesc] = useState("");
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A stable draft id for THIS form instance — the idempotency key so a
  // double-click / back-refresh replays the same receipt (D26) instead of a dup.
  const [draftId] = useState(() => crypto.randomUUID());

  function applyDiag(code: string) {
    setDiagCode(code);
    const hit = icdOptions.find((d) => d.code === code);
    if (hit && !diagDesc) setDiagDesc(hit.description);
  }
  function applyProc(code: string) {
    setProcCode(code);
    const hit = cptOptions.find((c) => c.code === code);
    if (hit) {
      if (!procDesc) setProcDesc(hit.description);
      if (!estimatedCost && hit.averageCost) setEstimatedCost(hit.averageCost);
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await submitProviderPreauthAction({
        idempotencyKey: draftId,
        memberNumber,
        serviceType,
        benefitCategory,
        expectedDateOfService: expectedDate,
        diagnosisCode: diagCode,
        diagnosisDescription: diagDesc,
        procedureCode: procCode,
        procedureDescription: procDesc,
        estimatedCost,
        clinicalNotes,
      });
      if (res?.error) setError(res.error);
      // success redirects server-side
    });
  }

  return (
    <div className="space-y-5 bg-white border border-[#EEEEEE] rounded-lg p-5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-[#FDECEA] border border-[#DC3545]/30 px-4 py-3 text-sm font-semibold text-[#DC3545]" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Member / card number</label>
          <input className={inputCls} value={memberNumber} onChange={(e) => setMemberNumber(e.target.value)} placeholder="e.g. NWSC-2026-01234" />
        </div>
        <div>
          <label className={labelCls}>Expected date of service</label>
          <input type="date" className={inputCls} value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Service type</label>
          <select className={inputCls} value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)}>
            {SERVICE_TYPES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Benefit</label>
          <select className={inputCls} value={benefitCategory} onChange={(e) => setBenefitCategory(e.target.value as BenefitCategory)}>
            {BENEFITS.map((b) => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Diagnosis (ICD)</label>
          <input className={inputCls} list="icd-codes" value={diagCode} onChange={(e) => applyDiag(e.target.value)} placeholder="ICD-10 code" />
          <datalist id="icd-codes">
            {icdOptions.slice(0, 500).map((d) => <option key={d.code} value={d.code}>{d.description}</option>)}
          </datalist>
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Diagnosis description</label>
          <input className={inputCls} value={diagDesc} onChange={(e) => setDiagDesc(e.target.value)} placeholder="Clinical impression" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Procedure (CPT, optional)</label>
          <input className={inputCls} list="cpt-codes" value={procCode} onChange={(e) => applyProc(e.target.value)} placeholder="CPT code" />
          <datalist id="cpt-codes">
            {cptOptions.slice(0, 500).map((c) => <option key={c.code} value={c.code}>{c.description}</option>)}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>Requested service</label>
          <input className={inputCls} value={procDesc} onChange={(e) => setProcDesc(e.target.value)} placeholder="e.g. MRI brain" />
        </div>
        <div>
          <label className={labelCls}>Estimated cost (UGX)</label>
          <input type="number" min={0} className={inputCls} value={estimatedCost || ""} onChange={(e) => setEstimatedCost(Number(e.target.value))} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Clinical notes (optional)</label>
        <textarea className={`${inputCls} min-h-[80px]`} value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} placeholder="Supporting clinical justification" />
      </div>

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary disabled:opacity-60"
        >
          <Save size={15} /> {pending ? "Submitting…" : "Submit pre-authorization"}
        </button>
      </div>
    </div>
  );
}
