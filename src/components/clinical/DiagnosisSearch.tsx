"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X, AlertCircle } from "lucide-react";

interface ICD10 {
  code: string;
  description: string;
  category: string;
  standardCharge: number | null;
}

export interface SelectedDiagnosis {
  code: string;
  description: string;
  standardCharge: number | null;
  isPrimary: boolean;
}

interface Props {
  /** Controlled value — array of selected diagnoses */
  value: SelectedDiagnosis[];
  onChange: (val: SelectedDiagnosis[]) => void;
  /** max diagnoses allowed (default 5) */
  max?: number;
}

export function DiagnosisSearch({ value, onChange, max = 5 }: Props) {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<ICD10[]>([]);
  const [loading, setLoading]     = useState(false);
  const [open, setOpen]           = useState(false);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const dropRef                   = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/icd10?q=${encodeURIComponent(q)}`);
      const data: ICD10[] = await res.json();
      setResults(data);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(item: ICD10) {
    if (value.find(v => v.code === item.code)) return;
    const isPrimary = value.length === 0;
    onChange([...value, { code: item.code, description: item.description, standardCharge: item.standardCharge, isPrimary }]);
    setQuery("");
    setOpen(false);
  }

  function remove(code: string) {
    const next = value.filter(v => v.code !== code);
    // Ensure there's always a primary if items remain
    if (next.length > 0 && !next.some(v => v.isPrimary)) next[0].isPrimary = true;
    onChange(next);
  }

  function setPrimary(code: string) {
    onChange(value.map(v => ({ ...v, isPrimary: v.code === code })));
  }

  return (
    <div className="space-y-2">
      {/* Selected diagnoses */}
      {value.length > 0 && (
        <div className="space-y-1.5">
          {value.map(d => (
            <div key={d.code} className={`flex items-center gap-2 p-2 rounded-lg border text-sm ${
              d.isPrimary ? "border-avenue-indigo/40 bg-avenue-indigo/5" : "border-[#EEEEEE] bg-[#F8F9FA]"
            }`}>
              <button type="button" onClick={() => setPrimary(d.code)}
                className={`shrink-0 w-5 h-5 rounded-full border-2 transition-colors ${
                  d.isPrimary ? "border-avenue-indigo bg-avenue-indigo" : "border-[#EEEEEE] hover:border-avenue-indigo"
                }`} title="Set as primary diagnosis">
                {d.isPrimary && <span className="block w-full h-full rounded-full bg-white scale-[0.45]" />}
              </button>
              <div className="flex-1 min-w-0">
                <span className="font-mono font-bold text-avenue-indigo text-xs">{d.code}</span>
                <span className="mx-1.5 text-avenue-text-muted">—</span>
                <span className="text-avenue-text-heading">{d.description}</span>
                {d.isPrimary && <span className="ml-2 text-[10px] font-bold uppercase text-avenue-indigo bg-avenue-indigo/10 px-1.5 py-0.5 rounded-full">Primary</span>}
              </div>
              {d.standardCharge && (
                <span className="text-xs text-avenue-text-muted shrink-0">
                  KES {Number(d.standardCharge).toLocaleString("en-KE")}
                </span>
              )}
              <button type="button" onClick={() => remove(d.code)}
                className="shrink-0 text-avenue-text-muted hover:text-[#DC3545] transition-colors">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search input */}
      {value.length < max && (
        <div className="relative" ref={dropRef}>
          <div className="relative">
            <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${loading ? "text-avenue-indigo animate-pulse" : "text-avenue-text-muted"}`} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search ICD-10 by code or description…"
              className="w-full border border-[#EEEEEE] rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors"
            />
          </div>

          {open && results.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-[#EEEEEE] rounded-lg shadow-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto divide-y divide-[#F8F9FA]">
                {results.map(r => (
                  <button key={r.code} type="button" onMouseDown={() => select(r)}
                    className="w-full text-left px-4 py-2.5 hover:bg-avenue-indigo/5 transition-colors group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-avenue-indigo text-xs">{r.code}</span>
                        <span className="ml-2 text-sm text-avenue-text-heading group-hover:text-avenue-text-heading">{r.description}</span>
                        <p className="text-[10px] text-avenue-text-muted mt-0.5">{r.category}</p>
                      </div>
                      {r.standardCharge && (
                        <span className="shrink-0 text-xs font-semibold text-[#28A745] whitespace-nowrap">
                          KES {Number(r.standardCharge).toLocaleString("en-KE")}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-4 py-2 bg-[#F8F9FA] border-t border-[#EEEEEE] text-[10px] text-avenue-text-muted">
                Click a result to add · First added = primary diagnosis
              </div>
            </div>
          )}

          {open && query.length >= 2 && results.length === 0 && !loading && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-[#EEEEEE] rounded-lg shadow-lg px-4 py-3 text-sm text-avenue-text-muted flex items-center gap-2">
              <AlertCircle size={14} /> No ICD-10 codes found for &quot;{query}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
