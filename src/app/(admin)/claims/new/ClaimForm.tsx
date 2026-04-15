"use client";

import { useState, useMemo } from "react";
import { ChevronRight, ChevronLeft, Save, User, Building2, Stethoscope, FileText, AlertCircle, Info } from "lucide-react";

const PREAUTH_REQUIRED_CATEGORIES = new Set(["INPATIENT", "SURGICAL", "MATERNITY"]);
import { DiagnosisSearch, type SelectedDiagnosis } from "@/components/clinical/DiagnosisSearch";
import { ProcedureLineItems, type ClaimLineItem } from "@/components/clinical/ProcedureSearch";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { submitClaimAction } from "./actions";

interface Member  { id: string; name: string; memberNumber: string; group: string; package: string; }
interface Provider { id: string; name: string; type: string; tier: string; county: string; }

const BENEFIT_CATEGORIES = [
  { value: "INPATIENT",           label: "Inpatient"          },
  { value: "OUTPATIENT",          label: "Outpatient"         },
  { value: "MATERNITY",           label: "Maternity"          },
  { value: "DENTAL",              label: "Dental"             },
  { value: "OPTICAL",             label: "Optical"            },
  { value: "MENTAL_HEALTH",       label: "Mental Health"      },
  { value: "CHRONIC_DISEASE",     label: "Chronic Disease"    },
  { value: "SURGICAL",            label: "Surgical"           },
  { value: "AMBULANCE_EMERGENCY", label: "Emergency/Ambulance"},
  { value: "REHABILITATION",      label: "Rehabilitation"     },
  { value: "WELLNESS_PREVENTIVE", label: "Wellness/Preventive"},
  { value: "LAST_EXPENSE",        label: "Last Expense"       },
] as const;

const SERVICE_TYPES = [
  { value: "OUTPATIENT", label: "Outpatient" },
  { value: "INPATIENT",  label: "Inpatient"  },
  { value: "DAY_CASE",   label: "Day Case"   },
  { value: "EMERGENCY",  label: "Emergency"  },
] as const;

const STEPS = [
  { label: "Member & Provider", icon: User     },
  { label: "Encounter Details", icon: Building2 },
  { label: "Diagnoses",         icon: Stethoscope },
  { label: "Services & Billing",icon: FileText  },
];

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";
const labelCls = "text-xs font-bold text-avenue-text-muted uppercase block mb-1";

export function ClaimForm({ members, providers }: { members: Member[]; providers: Provider[] }) {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  // Step 1
  const [memberId, setMemberId]     = useState("");
  const [providerId, setProviderId] = useState("");

  // Step 2
  const [serviceType,     setServiceType]     = useState("OUTPATIENT");
  const [benefitCategory, setBenefitCategory] = useState("OUTPATIENT");
  const [dateOfService,   setDateOfService]   = useState("");
  const [admissionDate,   setAdmissionDate]   = useState("");
  const [dischargeDate,   setDischargeDate]   = useState("");
  const [attendingDoctor, setAttendingDoctor] = useState("");

  // Step 3
  const [diagnoses, setDiagnoses] = useState<SelectedDiagnosis[]>([]);

  // Step 4
  const [lineItems, setLineItems] = useState<ClaimLineItem[]>([]);

  const selectedMember   = members.find(m => m.id === memberId);
  const selectedProvider = providers.find(p => p.id === providerId);
  const totalBilled      = useMemo(() => lineItems.reduce((s, l) => s + l.billedAmount, 0), [lineItems]);
  const primaryIcdCode   = diagnoses.find(d => d.isPrimary)?.code ?? "";

  const canNext: boolean[] = [
    !!memberId && !!providerId,
    !!serviceType && !!dateOfService,
    diagnoses.length > 0,
    lineItems.length > 0 && totalBilled > 0,
  ];

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      await submitClaimAction({
        memberId,
        providerId,
        serviceType:     serviceType     as never,
        benefitCategory: benefitCategory as never,
        dateOfService,
        admissionDate:   admissionDate || undefined,
        dischargeDate:   dischargeDate || undefined,
        attendingDoctor: attendingDoctor || undefined,
        diagnoses,
        lineItems: lineItems.map(l => ({
          serviceCategory: l.serviceCategory as never,
          cptCode:    l.cptCode,
          description: l.description,
          icdCode:    l.icdCode,
          quantity:   l.quantity,
          unitCost:   l.unitCost,
          billedAmount: l.billedAmount,
        })),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {/* Step progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-1 flex-1">
              <div className={`flex items-center gap-1.5 ${i === step ? "" : "opacity-60"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  i < step  ? "bg-[#28A745] text-white" :
                  i === step ? "bg-avenue-indigo text-white" :
                  "bg-[#E6E7E8] text-[#6C757D]"
                }`}>
                  {i < step ? "✓" : <Icon size={14} />}
                </div>
                <span className={`text-xs font-semibold hidden sm:block ${i === step ? "text-avenue-indigo" : "text-avenue-text-muted"}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-2 ${i < step ? "bg-[#28A745]" : "bg-[#EEEEEE]"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6 space-y-5">

        {/* ── Step 1: Member & Provider ── */}
        {step === 0 && (
          <div className="space-y-5">
            <h2 className="font-bold text-avenue-text-heading font-heading">Step 1 — Member &amp; Provider</h2>

            <div>
              <label className={labelCls}>Member *</label>
              <SearchSelect
                value={memberId}
                onChange={setMemberId}
                placeholder="Search by name, member number or group…"
                options={members.map(m => ({
                  id: m.id,
                  label: `${m.name} · ${m.memberNumber}`,
                  sublabel: `${m.group} · ${m.package}`,
                }))}
              />
              {selectedMember && (
                <div className="mt-2 p-3 bg-avenue-indigo/5 rounded-lg text-xs grid grid-cols-3 gap-2">
                  <div><span className="text-avenue-text-muted">Group:</span> <strong>{selectedMember.group}</strong></div>
                  <div><span className="text-avenue-text-muted">Package:</span> <strong>{selectedMember.package}</strong></div>
                  <div><span className="text-avenue-text-muted">No.:</span> <strong className="font-mono">{selectedMember.memberNumber}</strong></div>
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>Provider / Facility *</label>
              <SearchSelect
                value={providerId}
                onChange={setProviderId}
                placeholder="Search by name, type or county…"
                options={providers.map(p => ({
                  id: p.id,
                  label: p.name,
                  sublabel: `${p.type} · ${p.tier}${p.county ? ` · ${p.county}` : ""}`,
                }))}
              />
              {selectedProvider && (
                <div className="mt-2 p-3 bg-[#F8F9FA] rounded-lg text-xs grid grid-cols-3 gap-2">
                  <div><span className="text-avenue-text-muted">Type:</span> <strong>{selectedProvider.type}</strong></div>
                  <div><span className="text-avenue-text-muted">Tier:</span> <strong>{selectedProvider.tier}</strong></div>
                  <div><span className="text-avenue-text-muted">County:</span> <strong>{selectedProvider.county || "—"}</strong></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Encounter Details ── */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-bold text-avenue-text-heading font-heading">Step 2 — Encounter Details</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Service Type *</label>
                <select value={serviceType} onChange={e => setServiceType(e.target.value)} className={inputCls}>
                  {SERVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Benefit Category *</label>
                <select value={benefitCategory} onChange={e => setBenefitCategory(e.target.value)} className={inputCls}>
                  {BENEFIT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                {PREAUTH_REQUIRED_CATEGORIES.has(benefitCategory) && (
                  <div className="mt-2 flex items-start gap-1.5 text-[10px] text-[#856404] bg-[#FFF8E1] border border-[#FFC107]/40 rounded px-2.5 py-1.5">
                    <Info size={11} className="shrink-0 mt-0.5" />
                    <span><strong>{benefitCategory.charAt(0) + benefitCategory.slice(1).toLowerCase()}</strong> claims require an approved pre-authorization. Submission will be blocked if none exists.</span>
                  </div>
                )}
              </div>
              <div>
                <label className={labelCls}>Date of Service *</label>
                <input type="date" value={dateOfService} onChange={e => setDateOfService(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Attending Doctor</label>
                <input type="text" value={attendingDoctor} onChange={e => setAttendingDoctor(e.target.value)} placeholder="Dr. Name" className={inputCls} />
              </div>
            </div>

            {(serviceType === "INPATIENT" || serviceType === "DAY_CASE") && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#EEEEEE]">
                <div>
                  <label className={labelCls}>Admission Date</label>
                  <input type="date" value={admissionDate} onChange={e => setAdmissionDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Discharge Date</label>
                  <input type="date" value={dischargeDate} onChange={e => setDischargeDate(e.target.value)} className={inputCls} />
                </div>
                {admissionDate && dischargeDate && (
                  <div className="col-span-2 text-xs text-avenue-text-muted bg-[#F8F9FA] px-3 py-2 rounded-lg">
                    Length of stay: <strong>
                      {Math.max(0, Math.ceil((new Date(dischargeDate).getTime() - new Date(admissionDate).getTime()) / 86400000))} day(s)
                    </strong>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Diagnoses ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-avenue-text-heading font-heading">Step 3 — Diagnoses</h2>
              <p className="text-xs text-avenue-text-muted mt-0.5">Search ICD-10 codes. The first added is the primary diagnosis. Click the radio dot to change primary.</p>
            </div>
            <DiagnosisSearch value={diagnoses} onChange={setDiagnoses} />
            {diagnoses.length === 0 && (
              <p className="text-xs text-[#DC3545]">At least one diagnosis is required to proceed.</p>
            )}
          </div>
        )}

        {/* ── Step 4: Line Items ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-avenue-text-heading font-heading">Step 4 — Services &amp; Billing</h2>
              <p className="text-xs text-avenue-text-muted mt-0.5">
                Add each service as a separate line. Search CPT codes to auto-fill descriptions and standard charges.
                Primary diagnosis: <strong className="font-mono text-avenue-indigo">{primaryIcdCode || "—"}</strong>
              </p>
            </div>

            {/* Diagnosis summary */}
            <div className="flex flex-wrap gap-1.5">
              {diagnoses.map(d => (
                <span key={d.code} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.isPrimary ? "bg-avenue-indigo text-white" : "bg-[#E6E7E8] text-[#6C757D]"}`}>
                  {d.code} — {d.description}
                </span>
              ))}
            </div>

            <ProcedureLineItems value={lineItems} onChange={setLineItems} primaryIcdCode={primaryIcdCode} />

            {lineItems.length === 0 && (
              <p className="text-xs text-[#DC3545]">Add at least one service line to submit.</p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-2 px-5 py-2 rounded-full border border-[#EEEEEE] text-avenue-text-body hover:border-avenue-indigo hover:text-avenue-indigo transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} /> Back
        </button>

        {/* Summary pill when on last step */}
        {step === 3 && totalBilled > 0 && (
          <span className="text-sm font-bold text-avenue-indigo bg-avenue-indigo/10 px-4 py-2 rounded-full">
            Total: KES {totalBilled.toLocaleString("en-KE")}
          </span>
        )}

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep(s => s + 1)}
            disabled={!canNext[step]}
            className="flex items-center gap-2 px-6 py-2 rounded-full bg-avenue-indigo text-white font-semibold hover:bg-avenue-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !canNext[3]}
            className="flex items-center gap-2 px-6 py-2 rounded-full bg-[#28A745] hover:bg-[#218838] text-white font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {loading ? "Submitting…" : "Submit Claim"}
          </button>
        )}
      </div>
    </div>
  );
}
