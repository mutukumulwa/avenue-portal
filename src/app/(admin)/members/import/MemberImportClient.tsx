"use client";

import { useActionState, useRef, useState } from "react";
import { parseImportAction, confirmImportAction } from "./actions";
import type { ParseResult, ImportResult } from "./actions";
import { buildCsv } from "@/lib/csv-safe";
import { Upload, CheckCircle, XCircle, AlertTriangle, Download, Info } from "lucide-react";

type Group = { id: string; name: string };

/** WP-B1: download the persisted reject list — every cell CSV-injection-safe. */
function downloadRejects(failed: ImportResult["failed"]) {
  const csv = buildCsv(["Row", "Name", "Reason"], failed.map(f => [f.row, f.name, f.error]));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "member-import-rejects.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function MemberImportClient({ groups }: { groups: Group[] }) {
  const [parseResult, parseAction, parsePending] = useActionState<ParseResult | null, FormData>(parseImportAction, null);
  const [importResult, importAction, importPending] = useActionState<ImportResult | null, FormData>(confirmImportAction, null);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

  /**
   * UAT-HF P06.05 — DEF-069.
   *
   * "With a valid CSV attached and Target Group left at 'Select group…',
   * clicking 'Parse & Validate' produced nothing at all — no message, no
   * highlight, no alert ... The underlying state shows the browser was ready to
   * explain it: the select reported required = true, validationMessage 'Please
   * select an item in the list.' and form.checkValidity() = false. The operator
   * is left with a button that appears broken."
   *
   * The browser knew. Nothing surfaced it. Two things could suppress it and both
   * are fixed here rather than guessing between them:
   *
   *   * the file input carried `required` AND `className="hidden"`, and a
   *     required control that cannot be focused makes the browser abandon
   *     validation for the WHOLE form — silently. It is `sr-only` now, so it is
   *     focusable and reportable while staying visually hidden;
   *   * a React `action` submit can bypass the native bubble, so this renders
   *     its OWN summary and focuses the first invalid control, which works
   *     whatever the browser decides to do.
   */
  const [invalidFields, setInvalidFields] = useState<string[]>([]);

  const FIELD_LABELS: Record<string, string> = {
    groupId: "Target Group",
    file: "CSV file",
  };

  const validateBeforeSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = formRef.current;
    if (!form) return;
    const invalid = Array.from(form.elements).filter(
      (el): el is HTMLInputElement | HTMLSelectElement =>
        (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && !el.checkValidity(),
    );
    if (invalid.length === 0) {
      setInvalidFields([]);
      return;
    }
    e.preventDefault();
    setInvalidFields(invalid.map((el) => el.name));
    // Ask the browser to say it too, then put the caret where the work is.
    form.reportValidity();
    invalid[0]?.focus();
  };

  const validRows  = parseResult?.rows.filter(r => !r.error) ?? [];
  const errorRows  = parseResult?.rows.filter(r =>  r.error) ?? [];

  return (
    <div className="space-y-6">
      {/* Step 1 — Upload */}
      {!importResult && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-brand-text-heading font-heading">Step 1 — Upload CSV</h2>
          <p className="text-sm text-brand-text-body">
            File must have headers:{" "}
            <code className="bg-[#F8F9FA] px-1 rounded text-xs">
              firstName, lastName, dateOfBirth, gender, relationship, principalIdNumber, idNumber, phone, email, sourceReference, isExample
            </code>
          </p>

          <form ref={formRef} action={parseAction} onSubmit={validateBeforeSubmit} className="space-y-4">
            {/* DEF-069: the summary the run found missing entirely. */}
            {invalidFields.length > 0 && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-lg border border-[#DC3545]/30 bg-[#DC3545]/10 px-4 py-3 text-sm text-[#DC3545]"
              >
                <p className="font-semibold">Nothing was parsed — this form is not complete yet.</p>
                <ul className="mt-1 list-disc pl-5">
                  {invalidFields.map((f) => (
                    <li key={f}>{FIELD_LABELS[f] ?? f} is required.</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <label htmlFor="import-group" className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Target Group</label>
              <select
                id="import-group"
                name="groupId"
                required
                aria-invalid={invalidFields.includes("groupId") ? true : undefined}
                value={selectedGroup}
                onChange={e => setSelectedGroup(e.target.value)}
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo bg-white"
              >
                <option value="">Select group…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            <div
              className="border-2 border-dashed border-[#DCDCDC] rounded-lg p-8 text-center cursor-pointer hover:border-brand-indigo transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={28} className="mx-auto mb-2 text-brand-text-muted" />
              <label htmlFor="import-file" className="cursor-pointer text-sm text-brand-text-body">
                {fileName ?? "Click to select a CSV file"}
              </label>
              {/*
                `sr-only`, NOT `hidden`. A required control with display:none
                cannot be focused, and the browser then abandons validation for
                the entire form without saying anything — which is one of the two
                ways DEF-069's button could appear broken.
              */}
              <input
                ref={fileRef}
                id="import-file"
                name="file"
                type="file"
                accept=".csv"
                required
                aria-invalid={invalidFields.includes("file") ? true : undefined}
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                className="sr-only"
              />
            </div>

            {parseResult?.error && (
              <div className="px-4 py-2.5 bg-[#DC3545]/10 text-[#DC3545] text-sm rounded-lg">
                {parseResult.error}
              </div>
            )}

            <button
              type="submit"
              disabled={parsePending}
              className="bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {parsePending ? "Parsing…" : "Parse & Validate"}
            </button>
          </form>
        </div>
      )}

      {/* Step 2 — Preview */}
      {parseResult && !importResult && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-brand-text-muted">Total Rows</p>
              <p className="text-2xl font-bold text-brand-indigo mt-1">{parseResult.rows.length}</p>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-brand-text-muted">Valid</p>
              <p className="text-2xl font-bold text-[#28A745] mt-1">{parseResult.validCount}</p>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-brand-text-muted">Errors</p>
              <p className="text-2xl font-bold text-[#DC3545] mt-1">{parseResult.errorCount}</p>
            </div>
          </div>

          {/* Parser notes — unknown/ignored columns, missing required headers */}
          {parseResult.notes && parseResult.notes.length > 0 && (
            <div className="bg-[#FFF9E6] border border-[#FFE58F] rounded-lg px-4 py-3 space-y-1">
              {parseResult.notes.map((n, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-[#8A6D3B]">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>{n}</span>
                </div>
              ))}
            </div>
          )}

          {/* Error rows */}
          {errorRows.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center gap-2 text-[#DC3545]">
                <AlertTriangle size={15} />
                <span className="font-bold text-sm">Rows with errors — will be skipped</span>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#FFF5F5] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                    <th className="px-4 py-2 text-left">Row</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEEEEE]">
                  {errorRows.map(r => (
                    <tr key={r.row}>
                      <td className="px-4 py-2 font-mono">{r.row}</td>
                      <td className="px-4 py-2">{r.firstName} {r.lastName}</td>
                      <td className="px-4 py-2 text-[#DC3545]">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Valid rows preview */}
          {validRows.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center gap-2 text-[#28A745]">
                <CheckCircle size={15} />
                <span className="font-bold text-sm">Valid rows — ready to import</span>
              </div>
              <div className="min-w-0 overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0">
                    <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                      <th className="px-4 py-2 text-left">Row</th>
                      <th className="px-4 py-2 text-left">Name</th>
                      <th className="px-4 py-2 text-left">ID No.</th>
                      <th className="px-4 py-2 text-left">DOB</th>
                      <th className="px-4 py-2 text-left">Gender</th>
                      <th className="px-4 py-2 text-left">Relationship</th>
                      <th className="px-4 py-2 text-left">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEEEEE]">
                    {validRows.map(r => (
                      <tr key={r.row} className="hover:bg-[#F8F9FA]">
                        <td className="px-4 py-2 font-mono">{r.row}</td>
                        <td className="px-4 py-2 font-semibold">
                          {r.firstName} {r.lastName}
                          {r.warnings?.map((warning) => (
                            <p key={warning} className="mt-1 max-w-md font-normal text-[#8A6D3B]">
                              Check: {warning}
                            </p>
                          ))}
                        </td>
                        <td className="px-4 py-2">{r.idNumber || "—"}</td>
                        <td className="px-4 py-2">{r.dateOfBirth}</td>
                        <td className="px-4 py-2">{r.gender}</td>
                        <td className="px-4 py-2">{r.relationship}</td>
                        <td className="px-4 py-2">{r.phone || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Confirm form */}
          {validRows.length > 0 && (
            <form action={importAction}>
              <input type="hidden" name="groupId" value={selectedGroup} />
              <input type="hidden" name="rows" value={JSON.stringify(parseResult.rows)} />
              <input type="hidden" name="fileName" value={parseResult.fileName ?? ""} />
              <input type="hidden" name="preflightDate" value={parseResult.preflightDate ?? ""} />
              <input type="hidden" name="preflightToken" value={parseResult.preflightToken ?? ""} />
              <button
                type="submit"
                disabled={importPending}
                className="bg-[#28A745] hover:bg-[#218838] text-white px-6 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {importPending ? "Importing…" : `Confirm — Import ${validRows.length} member${validRows.length !== 1 ? "s" : ""}`}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Step 3 — Result */}
      {importResult && (
        <div className="space-y-4">
          <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm space-y-3">
            <div className={`flex items-center gap-2 ${importResult.error ? "text-[#DC3545]" : "text-[#28A745]"}`}>
              {importResult.error ? <XCircle size={20} /> : <CheckCircle size={20} />}
              <h2 className="font-bold text-lg font-heading">
                {importResult.error ? "Import status" : "Import complete"}
              </h2>
            </div>
            {importResult.error ? (
              <p className="text-[#DC3545] text-sm font-semibold">{importResult.error}</p>
            ) : (
              <p className="text-brand-text-body text-sm">
                <span className="font-bold text-[#28A745]">{importResult.imported}</span> member{importResult.imported !== 1 ? "s" : ""} successfully imported.
                {importResult.failed.length > 0 && (
                  <> <span className="font-bold text-[#DC3545]">{importResult.failed.length}</span> failed (see below).</>
                )}
              </p>
            )}
            {importResult.alreadyImported && (
              <div className="flex items-start gap-2 text-xs text-[#8A6D3B] bg-[#FFF9E6] border border-[#FFE58F] rounded-lg px-3 py-2">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>This file was already imported for this group — no duplicate members were created (showing the original result).</span>
              </div>
            )}
            {importResult.batchRef && (
              <p className="text-xs text-brand-text-muted">
                Import reference: <strong className="font-mono text-brand-text-heading">{importResult.batchRef}</strong>
                {importResult.status ? ` · ${importResult.status}` : ""}
              </p>
            )}
          </div>

          {importResult.failed.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center justify-between text-[#DC3545]">
                <div className="flex items-center gap-2">
                  <XCircle size={15} />
                  <span className="font-bold text-sm">Failed rows</span>
                </div>
                <button
                  type="button"
                  onClick={() => downloadRejects(importResult.failed)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-brand-indigo hover:text-brand-secondary transition-colors"
                >
                  <Download size={13} /> Download reject list
                </button>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#FFF5F5] text-[#6C757D] font-semibold border-b border-[#EEEEEE]">
                    <th className="px-4 py-2 text-left">Row</th>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEEEEE]">
                  {importResult.failed.map(f => (
                    <tr key={f.row}>
                      <td className="px-4 py-2 font-mono">{f.row}</td>
                      <td className="px-4 py-2">{f.name}</td>
                      <td className="px-4 py-2 text-[#DC3545]">{f.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
