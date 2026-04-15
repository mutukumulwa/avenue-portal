"use client";

import { useActionState, useRef, useState } from "react";
import { parseImportAction, confirmImportAction } from "./actions";
import type { ParseResult, ImportResult, ParsedRow } from "./actions";
import { Upload, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

type Group = { id: string; name: string };

export function MemberImportClient({ groups }: { groups: Group[] }) {
  const [parseResult, parseAction, parsePending] = useActionState<ParseResult | null, FormData>(parseImportAction, null);
  const [importResult, importAction, importPending] = useActionState<ImportResult | null, FormData>(confirmImportAction, null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedGroup, setSelectedGroup] = useState("");

  const validRows  = parseResult?.rows.filter(r => !r.error) ?? [];
  const errorRows  = parseResult?.rows.filter(r =>  r.error) ?? [];
  const confirmed  = !!importResult;

  return (
    <div className="space-y-6">
      {/* Step 1 — Upload */}
      {!importResult && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="font-bold text-avenue-text-heading font-heading">Step 1 — Upload CSV</h2>
          <p className="text-sm text-avenue-text-body">
            File must have headers:{" "}
            <code className="bg-[#F8F9FA] px-1 rounded text-xs">
              firstName, lastName, dateOfBirth, gender, relationship, principalIdNumber, idNumber, phone, email, isExample
            </code>
          </p>

          <form action={parseAction} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Target Group</label>
              <select
                name="groupId"
                required
                value={selectedGroup}
                onChange={e => setSelectedGroup(e.target.value)}
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo bg-white"
              >
                <option value="">Select group…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            <div
              className="border-2 border-dashed border-[#DCDCDC] rounded-lg p-8 text-center cursor-pointer hover:border-avenue-indigo transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={28} className="mx-auto mb-2 text-avenue-text-muted" />
              <p className="text-sm text-avenue-text-body">Click to select a CSV file</p>
              <input ref={fileRef} name="file" type="file" accept=".csv" className="hidden" required />
            </div>

            {parseResult?.error && (
              <div className="px-4 py-2.5 bg-[#DC3545]/10 text-[#DC3545] text-sm rounded-lg">
                {parseResult.error}
              </div>
            )}

            <button
              type="submit"
              disabled={parsePending}
              className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-60"
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
              <p className="text-xs font-bold uppercase text-avenue-text-muted">Total Rows</p>
              <p className="text-2xl font-bold text-avenue-indigo mt-1">{parseResult.rows.length}</p>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-avenue-text-muted">Valid</p>
              <p className="text-2xl font-bold text-[#28A745] mt-1">{parseResult.validCount}</p>
            </div>
            <div className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-xs font-bold uppercase text-avenue-text-muted">Errors</p>
              <p className="text-2xl font-bold text-[#DC3545] mt-1">{parseResult.errorCount}</p>
            </div>
          </div>

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
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
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
                        <td className="px-4 py-2 font-semibold">{r.firstName} {r.lastName}</td>
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
            <div className="flex items-center gap-2 text-[#28A745]">
              <CheckCircle size={20} />
              <h2 className="font-bold text-lg font-heading">Import complete</h2>
            </div>
            <p className="text-avenue-text-body text-sm">
              <span className="font-bold text-[#28A745]">{importResult.imported}</span> member{importResult.imported !== 1 ? "s" : ""} successfully imported.
              {importResult.failed.length > 0 && (
                <> <span className="font-bold text-[#DC3545]">{importResult.failed.length}</span> failed (see below).</>
              )}
            </p>
          </div>

          {importResult.failed.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center gap-2 text-[#DC3545]">
                <XCircle size={15} />
                <span className="font-bold text-sm">Failed rows</span>
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
