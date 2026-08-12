"use client";

import { useActionState } from "react";
import { Save, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createPackageAction } from "./actions";
import type { ActionResult } from "@/lib/action-result";
import { BASE_CURRENCY } from "@/lib/utils";
import { MoneyField } from "@/components/forms/MoneyField";

const inputCls =
  "w-full border border-[#EEEEEE] rounded-md px-4 py-2 outline-none focus:border-[#0B1437] transition-colors";

export default function PackageBuilder() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    createPackageAction,
    { ok: true },
  );
  const errs = state.ok ? {} : state.fieldErrors ?? {};
  const formError = state.ok ? undefined : state.formError;
  const err = (f: string) => (errs[f] ? errs[f][0] : undefined);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/packages" className="text-[#848E9F] hover:text-brand-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-['Sora']">Build a Package</h1>
          <p className="text-[#848E9F] font-['Hanken_Grotesk'] mt-1">Configure limits, benefits, and dependencies.</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-6 relative">
        <form action={formAction} className="space-y-6">
          {formError && (
            <p role="alert" className="text-sm text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded px-3 py-2">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Package Name</label>
              <input required name="name" type="text" className={inputCls} placeholder="e.g. Medvex Gold Corporate"
                aria-invalid={err("name") ? true : undefined} />
              {err("name") && <p role="alert" className="text-xs text-[#DC3545]">{err("name")}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Package Type</label>
              <select name="type" className={inputCls}>
                <option value="GROUP">Group</option>
                <option value="CORPORATE">Corporate</option>
                <option value="INDIVIDUAL">Individual</option>
                <option value="FAMILY">Family</option>
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-semibold text-brand-text-heading">Description</label>
              <textarea name="description" className={inputCls} placeholder="Package overview..."></textarea>
            </div>
          </div>

          <div className="border-t border-[#EEEEEE] pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* UAT-HF P09.02 — DEF-018. These were <input type="number">, which
                is what silently swallowed the "k" in "300k" and left the field
                holding 300, valid, with no warning. MoneyField parses the text
                itself, names a magnitude suffix as its own error, and reads the
                understood value back before anything is saved. */}
            <div className="space-y-2">
              <MoneyField
                name="annualLimit"
                label="Overall Annual Limit"
                currency={BASE_CURRENCY}
                defaultValue="500000"
                required
                error={err("annualLimit")}
              />
            </div>

            <div className="space-y-2">
              <MoneyField
                name="contributionAmount"
                label="Annual Premium Contribution"
                currency={BASE_CURRENCY}
                defaultValue="25000"
                required
                error={err("contributionAmount")}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Minimum Age</label>
              <input required name="minAge" type="number" min="0" max="120" defaultValue="0" className={inputCls}
                aria-invalid={err("minAge") ? true : undefined} />
              {err("minAge") && <p role="alert" className="text-xs text-[#DC3545]">{err("minAge")}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-text-heading">Maximum Age (Principals)</label>
              <input required name="maxAge" type="number" min="0" max="120" defaultValue="65" className={inputCls}
                aria-invalid={err("maxAge") ? true : undefined} />
              {err("maxAge") && <p role="alert" className="text-xs text-[#DC3545]">{err("maxAge")}</p>}
            </div>
          </div>

          <div className="border-t border-[#EEEEEE] pt-6 space-y-4">
            <h3 className="text-lg font-bold text-brand-text-heading font-['Sora']">Core Benefits</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {([
                { key: "inpatient", label: "Inpatient", limitName: "inpatientLimit", perVisitName: "inpatientPerVisit", limitDefault: "500000" },
                { key: "outpatient", label: "Outpatient", limitName: "outpatientLimit", perVisitName: "outpatientPerVisit", limitDefault: "100000" },
              ] as const).map((b) => (
                <div key={b.key} className="space-y-3 bg-[#F8F9FA] p-4 rounded-lg border border-[#EEEEEE]">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-brand-text-heading">{b.label} Sub-Limit ({BASE_CURRENCY})</label>
                    <input required name={b.limitName} type="number" min="0" step="0.01" defaultValue={b.limitDefault} className={inputCls}
                      aria-invalid={err(b.limitName) ? true : undefined} />
                    {err(b.limitName) && <p role="alert" className="text-xs text-[#DC3545]">{err(b.limitName)}</p>}
                  </div>
                  {/* DEF-022: per-visit cap wired to the existing enforcement. */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-brand-text-heading">
                      {b.label} Per-Visit Limit ({BASE_CURRENCY}) <span className="font-normal text-xs text-brand-text-muted">(optional)</span>
                    </label>
                    <input name={b.perVisitName} type="number" min="0" step="0.01" placeholder="No per-visit cap" className={inputCls}
                      aria-invalid={err(b.perVisitName) ? true : undefined} />
                    {err(b.perVisitName) && <p role="alert" className="text-xs text-[#DC3545]">{err(b.perVisitName)}</p>}
                  </div>
                  {/* WP-F1/D8: how this benefit pays providers */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-brand-text-heading">Funding Model</label>
                    <select name={`${b.key}FundingModel`} defaultValue="FEE_FOR_SERVICE" className={inputCls}>
                      <option value="FEE_FOR_SERVICE">Fee for service</option>
                      <option value="CAPITATION">Capitation</option>
                      <option value="HYBRID">Hybrid (per service tier)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-brand-text-heading">
                      Capitated tiers <span className="font-normal text-xs text-brand-text-muted">(Hybrid only — others pay fee-for-service)</span>
                    </label>
                    <select name={`${b.key}CapitatedTiers`} multiple size={4} className={inputCls}>
                      {["HEADLINE", "LABORATORY", "IMAGING", "PHARMACY", "THEATRE", "PROFESSIONAL_FEES", "OTHER"].map((t) => (
                        <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <button
              type="submit"
              disabled={pending}
              className="bg-[#0B1437] hover:bg-[#142150] text-white px-8 py-3 rounded-full font-semibold transition-colors flex items-center space-x-2 shadow-sm disabled:opacity-50"
            >
              <Save size={18} />
              <span>{pending ? "Saving…" : "Save Package & Activate"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
