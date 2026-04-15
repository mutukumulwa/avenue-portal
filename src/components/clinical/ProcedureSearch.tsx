"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, AlertCircle, Loader2 } from "lucide-react";

interface CPT {
  code: string;
  description: string;
  category: string;
  serviceCategory: string;
  averageCost: number | null;
}

export interface ClaimLineItem {
  id: string;
  serviceCategory: "CONSULTATION" | "LABORATORY" | "PHARMACY" | "IMAGING" | "PROCEDURE" | "OTHER";
  cptCode: string;
  description: string;
  icdCode: string;
  quantity: number;
  unitCost: number;
  billedAmount: number;
}

const CATEGORIES = [
  { value: "CONSULTATION", label: "Consultation", color: "bg-avenue-indigo/10 text-avenue-indigo"  },
  { value: "LABORATORY",   label: "Laboratory",   color: "bg-[#17A2B8]/10 text-[#17A2B8]"          },
  { value: "PHARMACY",     label: "Pharmacy",     color: "bg-[#28A745]/10 text-[#28A745]"          },
  { value: "IMAGING",      label: "Imaging",      color: "bg-[#FFC107]/10 text-[#856404]"          },
  { value: "PROCEDURE",    label: "Procedure",    color: "bg-[#DC3545]/10 text-[#DC3545]"          },
  { value: "OTHER",        label: "Other",        color: "bg-[#6C757D]/10 text-[#6C757D]"          },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"];

// ── Inline description field with CPT autocomplete ────────────────────────────

interface DescriptionInputProps {
  value: string;
  category: string;
  onChange: (patch: { description?: string; cptCode?: string }) => void;
  onSelectCpt: (cpt: CPT) => void;
}

function DescriptionInput({ value, category, onChange, onSelectCpt }: DescriptionInputProps) {
  const [results, setResults]   = useState<CPT[]>([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const [noMatch, setNoMatch]   = useState(false);
  const containerRef            = useRef<HTMLDivElement>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); setNoMatch(false); return; }
    setLoading(true);
    try {
      const cat = category && category !== "OTHER" ? `&category=${category}` : "";
      const res  = await fetch(`/api/cpt?q=${encodeURIComponent(q)}${cat}`);
      const data: CPT[] = await res.json();
      setResults(data);
      setNoMatch(data.length === 0);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [category]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    onChange({ description: q });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 250);
  }

  function pick(cpt: CPT) {
    onSelectCpt(cpt);
    setOpen(false);
    setResults([]);
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const inputCls = "border border-[#EEEEEE] rounded px-2 py-1 text-sm focus:outline-none focus:border-avenue-indigo transition-colors w-full";

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => value.length >= 2 && results.length > 0 && setOpen(true)}
          placeholder="Type description or CPT code to search…"
          className={`${inputCls} pr-7`}
          autoComplete="off"
        />
        {loading && (
          <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-avenue-indigo animate-spin" />
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#EEEEEE] rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-1.5 bg-[#F8F9FA] border-b border-[#EEEEEE] text-[10px] font-bold uppercase text-avenue-text-muted">
            CPT codes — click to select
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-[#F8F9FA]">
            {results.map(r => (
              <button key={r.code} type="button" onMouseDown={() => pick(r)}
                className="w-full text-left px-3 py-2.5 hover:bg-avenue-indigo/5 transition-colors group">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-avenue-indigo text-xs">{r.code}</span>
                    <span className="ml-2 text-sm text-avenue-text-heading truncate">{r.description}</span>
                  </div>
                  {r.averageCost != null && (
                    <span className="shrink-0 text-xs font-semibold text-[#28A745]">
                      KES {r.averageCost.toLocaleString("en-KE")}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-avenue-text-muted mt-0.5 ml-0">{r.category}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {open && noMatch && !loading && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#EEEEEE] rounded-lg shadow-lg px-3 py-3 text-sm text-avenue-text-muted flex items-center gap-2">
          <AlertCircle size={13} /> No CPT codes found — description saved as free text
        </div>
      )}
    </div>
  );
}

// ── CptCodeInput — autocomplete on the code field ────────────────────────────

interface CptCodeInputProps {
  value: string;
  category: string;
  onChange: (val: string) => void;
  onSelectCpt: (cpt: CPT) => void;
}

function CptCodeInput({ value, category, onChange, onSelectCpt }: CptCodeInputProps) {
  const [results, setResults]   = useState<CPT[]>([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const containerRef            = useRef<HTMLDivElement>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const cat = category && category !== "OTHER" ? `&category=${category}` : "";
      const res  = await fetch(`/api/cpt?q=${encodeURIComponent(q)}${cat}`);
      const data: CPT[] = await res.json();
      setResults(data);
      if (data.length > 0) setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [category]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    onChange(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 250);
  }

  function pick(cpt: CPT) {
    onSelectCpt(cpt);
    setOpen(false);
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const inputCls = "border border-[#EEEEEE] rounded px-2 py-1 text-sm focus:outline-none focus:border-avenue-indigo transition-colors w-full font-mono";

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="99213"
          className={`${inputCls} pr-6`}
          autoComplete="off"
        />
        {loading && (
          <Loader2 size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-avenue-indigo animate-spin" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 right-0 w-80 bg-white border border-[#EEEEEE] rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-48 overflow-y-auto divide-y divide-[#F8F9FA]">
            {results.map(r => (
              <button key={r.code} type="button" onMouseDown={() => pick(r)}
                className="w-full text-left px-3 py-2 hover:bg-avenue-indigo/5 transition-colors">
                <span className="font-mono font-bold text-avenue-indigo text-xs">{r.code}</span>
                <span className="ml-2 text-xs text-avenue-text-heading">{r.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  value: ClaimLineItem[];
  onChange: (val: ClaimLineItem[]) => void;
  primaryIcdCode?: string;
}

function uid() { return Math.random().toString(36).slice(2, 9); }

export function ProcedureLineItems({ value, onChange, primaryIcdCode = "" }: Props) {
  function addLine(cat: CategoryValue) {
    onChange([...value, {
      id: uid(), serviceCategory: cat,
      cptCode: "", description: "", icdCode: primaryIcdCode,
      quantity: 1, unitCost: 0, billedAmount: 0,
    }]);
  }

  function updateLine(id: string, patch: Partial<ClaimLineItem>) {
    onChange(value.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, ...patch };
      updated.billedAmount = updated.quantity * updated.unitCost;
      return updated;
    }));
  }

  function removeLine(id: string) {
    onChange(value.filter(l => l.id !== id));
  }

  function applyCode(id: string, cpt: CPT) {
    onChange(value.map(l => {
      if (l.id !== id) return l;
      return {
        ...l,
        cptCode:     cpt.code,
        description: cpt.description,
        unitCost:    cpt.averageCost ?? l.unitCost,
        billedAmount:(cpt.averageCost ?? l.unitCost) * l.quantity,
        serviceCategory: (cpt.serviceCategory as CategoryValue) ?? l.serviceCategory,
      };
    }));
  }

  const total = value.reduce((s, l) => s + l.billedAmount, 0);
  const inputCls = "border border-[#EEEEEE] rounded px-2 py-1 text-sm focus:outline-none focus:border-avenue-indigo transition-colors w-full";

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((line, idx) => {
            const cat = CATEGORIES.find(c => c.value === line.serviceCategory) ?? CATEGORIES[0];
            return (
              <div key={line.id} className="border border-[#EEEEEE] rounded-lg p-3 bg-white space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-avenue-text-muted font-bold">#{idx + 1}</span>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      value={line.serviceCategory}
                      onChange={e => updateLine(line.id, { serviceCategory: e.target.value as CategoryValue })}
                      className="text-xs border border-[#EEEEEE] rounded px-2 py-1 focus:outline-none focus:border-avenue-indigo"
                    >
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <button type="button" onClick={() => removeLine(line.id)}
                      className="p-1 rounded text-avenue-text-muted hover:text-[#DC3545] hover:bg-[#DC3545]/10 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Fields grid */}
                <div className="grid grid-cols-12 gap-2">
                  {/* Description — spans most of the row, has CPT autocomplete */}
                  <div className="col-span-6">
                    <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-0.5">
                      Description <span className="normal-case font-normal">(type to search CPT codes)</span>
                    </label>
                    <DescriptionInput
                      value={line.description}
                      category={line.serviceCategory}
                      onChange={patch => updateLine(line.id, patch)}
                      onSelectCpt={cpt => applyCode(line.id, cpt)}
                    />
                  </div>

                  {/* CPT Code — also has autocomplete */}
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-0.5">CPT Code</label>
                    <CptCodeInput
                      value={line.cptCode}
                      category={line.serviceCategory}
                      onChange={val => updateLine(line.id, { cptCode: val })}
                      onSelectCpt={cpt => applyCode(line.id, cpt)}
                    />
                  </div>

                  {/* Qty */}
                  <div className="col-span-1">
                    <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-0.5">Qty</label>
                    <input type="number" min={1} value={line.quantity}
                      onChange={e => updateLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                      className={inputCls} />
                  </div>

                  {/* Unit cost */}
                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-0.5">Unit Cost (KES)</label>
                    <input type="number" min={0} step={0.01} value={line.unitCost || ""}
                      onChange={e => updateLine(line.id, { unitCost: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00" className={inputCls} />
                  </div>

                  {/* Total */}
                  <div className="col-span-1">
                    <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-0.5">Total</label>
                    <div className="border border-[#EEEEEE] rounded px-2 py-1 text-sm bg-[#F8F9FA] font-semibold text-avenue-indigo whitespace-nowrap">
                      {line.billedAmount.toLocaleString("en-KE")}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add line buttons */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => (
          <button key={cat.value} type="button" onClick={() => addLine(cat.value)}
            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${cat.color} border-transparent hover:opacity-80`}>
            <Plus size={12} /> {cat.label}
          </button>
        ))}
      </div>

      {/* Running total */}
      {value.length > 0 && (
        <div className="flex justify-between items-center pt-3 border-t border-[#EEEEEE]">
          <span className="text-xs font-bold text-avenue-text-muted uppercase">Total Billed Amount</span>
          <span className="text-lg font-bold text-avenue-indigo">KES {total.toLocaleString("en-KE")}</span>
        </div>
      )}

      {value.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed border-[#EEEEEE] rounded-lg text-avenue-text-muted text-sm">
          Click a service category above to add line items to this claim.
        </div>
      )}
    </div>
  );
}
