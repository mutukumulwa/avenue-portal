"use client";

/**
 * Family Hospital UAT plan P03.02 / FH-05 — the provider diagnosis search.
 *
 * Replaces a native `<select>` of up to 500 codes that only matched the start
 * of each label (so "malaria" found nothing). Searches code, description and
 * category on the server after two characters; shows code, description and
 * category — and nothing else: the DTO has no price field to render
 * (`ICD10Code.standardCharge` is never read by the search service).
 */
import { useCallback } from "react";
import type { CapturePurpose, DiagnosisOption } from "@/lib/provider-capture-contract";
import { searchDiagnosesAction } from "@/app/provider/capture-actions";
import { AsyncCombobox, type SearchOutcome } from "./AsyncCombobox";

export function DiagnosisCombobox({
  id,
  purpose,
  value,
  onChange,
  error,
  label = "Primary diagnosis (ICD-10)",
  disabled,
}: {
  id?: string;
  purpose: CapturePurpose;
  value: DiagnosisOption | null;
  onChange: (value: DiagnosisOption | null) => void;
  error?: string;
  label?: string;
  disabled?: boolean;
}) {
  const search = useCallback(
    async (query: string): Promise<SearchOutcome<DiagnosisOption>> => {
      const r = await searchDiagnosesAction({ purpose, query });
      return r.ok ? { ok: true, items: r.options } : { ok: false, message: r.message };
    },
    [purpose],
  );

  return (
    <AsyncCombobox<DiagnosisOption>
      id={id}
      label={label}
      required
      disabled={disabled}
      placeholder="Search by code or description, e.g. malaria or B54"
      hint="Search by code, description or category."
      error={error}
      search={search}
      getKey={(o) => o.code}
      itemText={(o) => `${o.code}, ${o.description}, ${o.category}`}
      renderItem={(o) => (
        <div>
          <span className="font-mono font-semibold text-brand-text-heading">{o.code}</span>
          <span className="text-brand-text-body"> — {o.description}</span>
          <div className="text-[11px] text-brand-text-muted">{o.category}</div>
        </div>
      )}
      value={value}
      renderValue={(o) => (
        <span>
          <span className="font-mono font-semibold text-brand-text-heading">{o.code}</span> — {o.description}
        </span>
      )}
      onSelect={onChange}
      onClear={() => onChange(null)}
      clearLabel="Clear diagnosis"
    />
  );
}
