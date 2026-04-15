"use client";

import { useState } from "react";
import { Calculator, ChevronRight, ChevronLeft } from "lucide-react";
import { generateQuotationAction } from "./actions";

const STEPS = ["Group Info", "Census & Age Bands", "Package", "Pricing", "Generate"];

const AGE_BANDS = [
  { key: "band_0_17",  label: "0 – 17 yrs",  factor: 0.50 },
  { key: "band_18_29", label: "18 – 29 yrs", factor: 0.80 },
  { key: "band_30_39", label: "30 – 39 yrs", factor: 1.00 },
  { key: "band_40_49", label: "40 – 49 yrs", factor: 1.30 },
  { key: "band_50_59", label: "50 – 59 yrs", factor: 1.70 },
  { key: "band_60p",   label: "60 + yrs",    factor: 2.20 },
];

// Hard-coded tiers as fallback — calculator is client-only so we can't hit DB directly.
// In production, pass packages as props from a parent server component if needed.
const DEFAULT_PACKAGES = [
  { id: null, name: "Avenue Essential",  annualLimit: 300000,  ratePerMember: 30000  },
  { id: null, name: "Avenue Premier",    annualLimit: 750000,  ratePerMember: 75000  },
  { id: null, name: "Avenue Executive",  annualLimit: 1500000, ratePerMember: 150000 },
];

const LOADINGS = [
  { key: "claimsHistory", label: "Claims History Loading" },
  { key: "industry",      label: "Industry Loading"       },
  { key: "custom",        label: "Custom Loading"         },
];

const DISCOUNTS = [
  { key: "groupSize", label: "Group Size Discount" },
  { key: "loyalty",   label: "Loyalty Discount"    },
  { key: "custom",    label: "Custom Discount"     },
];

export default function QuotationCalculatorPage() {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    prospectName:     "",
    prospectIndustry: "",
    prospectEmail:    "",
    memberCount:      0,
    dependentCount:   0,
    useAgeBands:      false,
    ageBandCounts:    {} as Record<string, number>,
    selectedIdx:      -1,
    loadings:         {} as Record<string, number>,
    discounts:        {} as Record<string, number>,
    pricingNotes:     "",
  });

  const selectedPkg = form.selectedIdx >= 0 ? DEFAULT_PACKAGES[form.selectedIdx] : null;
  const baseRate    = selectedPkg?.ratePerMember ?? 0;

  // Age-banded: each band count × (base rate × age factor). Sum = base contribution.
  const ageBandedTotal = form.useAgeBands
    ? AGE_BANDS.reduce((sum, b) => {
        const count = form.ageBandCounts[b.key] ?? 0;
        return sum + count * baseRate * b.factor;
      }, 0)
    : 0;

  const totalBandedLives = form.useAgeBands
    ? AGE_BANDS.reduce((sum, b) => sum + (form.ageBandCounts[b.key] ?? 0), 0)
    : 0;

  const flatLives        = form.memberCount + form.dependentCount;
  const totalLives       = form.useAgeBands ? totalBandedLives : flatLives;
  const baseAnnualPremium = form.useAgeBands ? ageBandedTotal : selectedPkg ? flatLives * baseRate : 0;

  const totalLoadingPct  = Object.values(form.loadings).reduce((s, v) => s + (v || 0), 0);
  const totalDiscountPct = Object.values(form.discounts).reduce((s, v) => s + (v || 0), 0);
  const finalPremium     = baseAnnualPremium * (1 + totalLoadingPct / 100) * (1 - totalDiscountPct / 100);
  const ratePerMember    = totalLives > 0 ? finalPremium / totalLives : 0;

  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

  const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo";

  async function handleGenerate() {
    setLoading(true);
    await generateQuotationAction({
      prospectName:     form.prospectName,
      prospectIndustry: form.prospectIndustry,
      prospectEmail:    form.prospectEmail,
      memberCount:      form.useAgeBands ? totalBandedLives : form.memberCount,
      dependentCount:   form.useAgeBands ? 0 : form.dependentCount,
      packageId:        selectedPkg?.id ?? null,
      ratePerMember:    Math.round(ratePerMember),
      annualPremium:    Math.round(baseAnnualPremium),
      finalPremium:     Math.round(finalPremium),
      loadings:         form.loadings,
      discounts:        form.discounts,
      pricingNotes:     form.pricingNotes,
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Calculator size={24} className="text-avenue-indigo" />
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Contribution Calculator</h1>
          <p className="text-avenue-text-body font-body mt-0.5">Generate a quotation in 5 steps.</p>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              i < step ? "bg-[#28A745] text-white" : i === step ? "bg-avenue-indigo text-white" : "bg-[#E6E7E8] text-[#6C757D]"
            }`}>
              {i < step ? "✓" : i + 1}
            </div>
            <span className={`text-xs font-semibold flex-1 hidden sm:block ${i === step ? "text-avenue-indigo" : "text-avenue-text-muted"}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px bg-[#EEEEEE] flex-1 hidden sm:block" />}
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-5">

        {/* Step 1: Group Info */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading">Step 1 — Prospect Information</h2>
            <input
              placeholder="Company / Prospect Name *"
              value={form.prospectName}
              onChange={(e) => setForm((f) => ({ ...f, prospectName: e.target.value }))}
              className={inputCls}
            />
            <input
              placeholder="Industry"
              value={form.prospectIndustry}
              onChange={(e) => setForm((f) => ({ ...f, prospectIndustry: e.target.value }))}
              className={inputCls}
            />
            <input
              placeholder="Contact Email"
              type="email"
              value={form.prospectEmail}
              onChange={(e) => setForm((f) => ({ ...f, prospectEmail: e.target.value }))}
              className={inputCls}
            />
          </div>
        )}

        {/* Step 2: Census & Age Bands */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="font-bold text-avenue-text-heading font-heading">Step 2 — Member Census &amp; Age Bands</h2>

            {/* Pricing mode toggle */}
            <div className="flex items-center gap-3 p-3 bg-[#F8F9FA] rounded-lg">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, useAgeBands: false }))}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${!form.useAgeBands ? "bg-avenue-indigo text-white" : "text-avenue-text-muted hover:bg-[#EEEEEE]"}`}
              >
                Flat Rate
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, useAgeBands: true }))}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${form.useAgeBands ? "bg-avenue-indigo text-white" : "text-avenue-text-muted hover:bg-[#EEEEEE]"}`}
              >
                Age-Banded
              </button>
              <span className="text-xs text-avenue-text-muted">Select pricing mode</span>
            </div>

            {!form.useAgeBands ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-avenue-text-muted uppercase block mb-1">Principal Members</label>
                  <input
                    type="number" min={1}
                    value={form.memberCount || ""}
                    onChange={(e) => setForm((f) => ({ ...f, memberCount: parseInt(e.target.value) || 0 }))}
                    className={inputCls} placeholder="0"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-avenue-text-muted uppercase block mb-1">Dependents</label>
                  <input
                    type="number" min={0}
                    value={form.dependentCount || ""}
                    onChange={(e) => setForm((f) => ({ ...f, dependentCount: parseInt(e.target.value) || 0 }))}
                    className={inputCls} placeholder="0"
                  />
                </div>
                <div className="col-span-2 bg-[#F8F9FA] rounded-lg p-4 text-sm">
                  <p className="text-avenue-text-muted">Total lives to be covered:</p>
                  <p className="text-2xl font-bold text-avenue-indigo mt-1">{form.memberCount + form.dependentCount}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-avenue-text-muted">Enter the number of members per age band. The base rate is multiplied by each band&apos;s age factor to produce a blended contribution.</p>
                <div className="overflow-hidden rounded-lg border border-[#EEEEEE]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F8F9FA] text-xs font-bold text-avenue-text-muted uppercase">
                        <th className="px-4 py-2 text-left">Age Band</th>
                        <th className="px-4 py-2 text-right">Age Factor</th>
                        <th className="px-4 py-2 text-right">No. of Lives</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEEEEE]">
                      {AGE_BANDS.map((band) => (
                        <tr key={band.key}>
                          <td className="px-4 py-2 font-medium text-avenue-text-heading">{band.label}</td>
                          <td className="px-4 py-2 text-right text-avenue-text-muted font-mono">{band.factor.toFixed(2)}×</td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number" min={0}
                              value={form.ageBandCounts[band.key] ?? ""}
                              onChange={(e) => setForm((f) => ({
                                ...f,
                                ageBandCounts: { ...f.ageBandCounts, [band.key]: parseInt(e.target.value) || 0 },
                              }))}
                              className="w-24 border border-[#EEEEEE] rounded px-2 py-1 text-right text-sm focus:outline-none focus:border-avenue-indigo"
                              placeholder="0"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-avenue-indigo/5 font-bold">
                        <td className="px-4 py-2 text-avenue-indigo" colSpan={2}>Total Lives</td>
                        <td className="px-4 py-2 text-right text-avenue-indigo">{totalBandedLives}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="text-xs text-avenue-text-muted">Age factors applied to base rate. Blended contribution previewed in Step 4.</p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Package */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading">Step 3 — Package Selection</h2>
            <div className="space-y-3">
              {DEFAULT_PACKAGES.map((pkg, idx) => (
                <button
                  key={idx}
                  onClick={() => setForm((f) => ({ ...f, selectedIdx: idx }))}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    form.selectedIdx === idx
                      ? "border-avenue-indigo bg-avenue-indigo/5"
                      : "border-[#EEEEEE] hover:border-avenue-indigo/40"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold text-avenue-text-heading">{pkg.name}</p>
                      <p className="text-xs text-avenue-text-muted mt-0.5">Annual limit: KES {pkg.annualLimit.toLocaleString()}</p>
                    </div>
                    <p className="font-bold text-avenue-indigo">KES {pkg.ratePerMember.toLocaleString()} / member</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Pricing */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-bold text-avenue-text-heading font-heading">Step 4 — Pricing</h2>

            <div className="bg-[#F8F9FA] rounded-lg p-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-avenue-text-muted">Base Rate / Member</span><span className="font-semibold">{fmt(selectedPkg?.ratePerMember ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-avenue-text-muted">Pricing Mode</span><span className="font-semibold">{form.useAgeBands ? "Age-Banded" : "Flat Rate"}</span></div>
              <div className="flex justify-between"><span className="text-avenue-text-muted">Total Lives</span><span className="font-semibold">{totalLives}</span></div>
              {form.useAgeBands && (
                <div className="mt-2 pt-2 border-t border-[#EEEEEE] space-y-1">
                  {AGE_BANDS.filter((b) => (form.ageBandCounts[b.key] ?? 0) > 0).map((b) => {
                    const count = form.ageBandCounts[b.key] ?? 0;
                    const bandPremium = count * baseRate * b.factor;
                    return (
                      <div key={b.key} className="flex justify-between text-avenue-text-muted">
                        <span>{b.label} ({count} × {b.factor.toFixed(2)}×)</span>
                        <span>{fmt(bandPremium)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between font-bold border-t border-[#EEEEEE] pt-2 mt-1"><span>Base Annual Contribution</span><span className="text-avenue-indigo">{fmt(baseAnnualPremium)}</span></div>
            </div>

            <div>
              <p className="text-xs font-bold text-avenue-text-muted uppercase mb-2">Loadings (+)</p>
              {LOADINGS.map((l) => (
                <div key={l.key} className="flex items-center gap-3 mb-2">
                  <label className="flex-1 text-sm">{l.label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min={0} max={50}
                      value={form.loadings[l.key] ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, loadings: { ...f.loadings, [l.key]: parseFloat(e.target.value) || 0 } }))}
                      className="w-20 border border-[#EEEEEE] rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-avenue-indigo"
                      placeholder="0"
                    />
                    <span className="text-avenue-text-muted text-sm">%</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-bold text-avenue-text-muted uppercase mb-2">Discounts (−)</p>
              {DISCOUNTS.map((d) => (
                <div key={d.key} className="flex items-center gap-3 mb-2">
                  <label className="flex-1 text-sm">{d.label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min={0} max={30}
                      value={form.discounts[d.key] ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, discounts: { ...f.discounts, [d.key]: parseFloat(e.target.value) || 0 } }))}
                      className="w-20 border border-[#EEEEEE] rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:border-avenue-indigo"
                      placeholder="0"
                    />
                    <span className="text-avenue-text-muted text-sm">%</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-avenue-indigo/5 border border-avenue-indigo/20 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-avenue-text-muted">Base Contribution</span><span>{fmt(baseAnnualPremium)}</span></div>
              {totalLoadingPct > 0 && <div className="flex justify-between text-orange-600"><span>+ Loadings ({totalLoadingPct}%)</span><span>+ {fmt(baseAnnualPremium * totalLoadingPct / 100)}</span></div>}
              {totalDiscountPct > 0 && <div className="flex justify-between text-[#28A745]"><span>− Discounts ({totalDiscountPct}%)</span><span>− {fmt(baseAnnualPremium * totalDiscountPct / 100)}</span></div>}
              <div className="flex justify-between font-bold text-base border-t border-avenue-indigo/20 pt-2">
                <span className="text-avenue-indigo">Final Annual Contribution</span>
                <span className="text-avenue-indigo">{fmt(finalPremium)}</span>
              </div>
              <div className="flex justify-between text-avenue-text-muted">
                <span>Rate per Member</span>
                <span>{fmt(ratePerMember)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Generate */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="font-bold text-avenue-text-heading font-heading">Step 5 — Review & Generate</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: "Prospect / Group",                value: form.prospectName || "—" },
                { label: "Industry",                         value: form.prospectIndustry || "—" },
                { label: "Package",                          value: selectedPkg?.name ?? "—" },
                { label: "Pricing Mode",                     value: form.useAgeBands ? "Age-Banded" : "Flat Rate" },
                { label: "Total Lives",                      value: String(totalLives) },
                { label: "Blended Rate / Member (KES)",      value: Math.round(ratePerMember).toLocaleString() },
                { label: "Base Annual Contribution (KES)",   value: Math.round(baseAnnualPremium).toLocaleString() },
                { label: "Final Annual Contribution (KES)",  value: Math.round(finalPremium).toLocaleString() },
                { label: "Valid for",                        value: "30 days from generation" },
              ].map((f) => (
                <div key={f.label} className="flex justify-between border-b border-[#F8F9FA] pb-2">
                  <span className="text-avenue-text-muted">{f.label}</span>
                  <span className="font-semibold text-avenue-text-heading">{f.value}</span>
                </div>
              ))}
            </div>
            <textarea
              placeholder="Pricing notes (optional)"
              value={form.pricingNotes}
              onChange={(e) => setForm((f) => ({ ...f, pricingNotes: e.target.value }))}
              rows={3}
              className={inputCls}
            />
            <button
              onClick={handleGenerate}
              disabled={loading || !form.prospectName || form.memberCount < 1}
              className="w-full bg-avenue-indigo hover:bg-avenue-secondary text-white py-3 rounded-full font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Generating…" : "Generate Quotation"}
            </button>
            {(!form.prospectName || form.memberCount < 1) && (
              <p className="text-xs text-avenue-text-muted text-center">Prospect name and at least 1 member required.</p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="flex items-center gap-2 px-5 py-2 rounded-full border border-[#EEEEEE] text-avenue-text-body hover:border-avenue-indigo hover:text-avenue-indigo transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} /> Back
        </button>
        {step < STEPS.length - 1 && (
          <button
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="flex items-center gap-2 px-6 py-2 rounded-full bg-avenue-indigo text-white hover:bg-avenue-secondary transition-colors font-semibold"
          >
            Next <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
