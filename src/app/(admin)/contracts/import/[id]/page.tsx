import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { commitExtractionAction } from "../actions";
import type { TariffCandidate, Ambiguity, ExtractionEntities } from "@/server/services/contract-extraction.service";

export const dynamic = "force-dynamic";

export default async function ExtractionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { id } = await params;
  const { error } = await searchParams;

  const [extraction, providers] = await Promise.all([
    prisma.contractExtraction.findUnique({ where: { id, tenantId: session.user.tenantId } }),
    prisma.provider.findMany({ where: { tenantId: session.user.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!extraction) notFound();

  const entities = (extraction.entities as unknown as ExtractionEntities) ?? null;
  const candidates = (extraction.tariffCandidates as unknown as TariffCandidate[]) ?? [];
  const ambiguities = (extraction.ambiguities as unknown as Ambiguity[]) ?? [];
  const stats = (extraction.stats as unknown as { rowsDetected: number; rowsWithRate: number; rowsMissingRate: number }) ?? { rowsDetected: 0, rowsWithRate: 0, rowsMissingRate: 0 };
  const defaultStart = entities?.effectiveDateCandidates?.[0] ?? "";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/contracts/import" className="inline-flex items-center gap-1 text-sm text-[#6C757D] hover:text-[#06B9AB] mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to import
      </Link>
      <h1 className="text-2xl font-semibold text-[#000523] mb-1">Review extraction</h1>
      <p className="text-sm text-[#6C757D] mb-6">{extraction.fileName ?? "pasted source"} · {stats.rowsWithRate} priced, {stats.rowsMissingRate} rate-missing, {stats.rowsDetected} total.</p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#DC3545]/10 px-4 py-3 text-sm text-[#DC3545]">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Ambiguities */}
          {ambiguities.length > 0 && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-[#000523] mb-3">Review questions ({ambiguities.length})</h2>
              <ul className="space-y-2">
                {ambiguities.map((a, i) => (
                  <li key={i} className={`text-xs ${a.blocking ? "text-[#DC3545]" : "text-[#9a4b06]"}`}>
                    <span className="font-semibold">{a.blocking ? "BLOCKING" : "confirm"}</span> · {a.type}: {a.message}
                    {a.candidates && a.candidates.length > 0 && <span className="text-[#6C757D]"> [{a.candidates.join(", ")}]</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Candidates */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#000523] mb-3">Tariff candidates</h2>
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-left uppercase tracking-wide text-[#6C757D]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium text-right">Rate</th>
                    <th className="px-3 py-2 font-medium">Page</th>
                    <th className="px-3 py-2 font-medium text-right">Conf.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {candidates.map((c, i) => (
                    <tr key={i} className={c.rateMissing ? "bg-[#FFF8E1]" : ""}>
                      <td className="px-3 py-1.5 text-[#000523]" title={c.sourceRef.rawText}>{c.description}</td>
                      <td className="px-3 py-1.5 text-[#6C757D]">{c.canonicalCategory ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right">{c.rateMissing ? <span className="text-[#DC3545]">rate missing</span> : c.amount?.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-[#6C757D]">{c.sourceRef.page}</td>
                      <td className="px-3 py-1.5 text-right text-[#6C757D]">{Math.round(c.confidence * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Commit */}
        <div>
          <section className="rounded-xl border border-gray-200 bg-white p-5 sticky top-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000523] mb-3">
              <CheckCircle2 className="w-4 h-4 text-[#28A745]" /> Create draft contract
            </h2>
            <p className="text-xs text-[#6C757D] mb-4">Imports all candidates as tariff lines (rate-missing rows block activation until priced). Lands in DRAFT for the normal approval path.</p>
            <form action={commitExtractionAction} className="space-y-3">
              <input type="hidden" name="id" value={extraction.id} />
              <div>
                <label className="block text-xs font-medium text-[#6C757D] mb-1">Provider *</label>
                <select name="providerId" required defaultValue="" className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-full">
                  <option value="" disabled>Select…</option>
                  {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6C757D] mb-1">Title *</label>
                <input name="title" required defaultValue={extraction.fileName?.replace(/\.md$/, "") ?? ""} className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6C757D] mb-1">Start date *</label>
                <input type="date" name="startDate" required defaultValue={defaultStart} className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6C757D] mb-1">End date *</label>
                <input type="date" name="endDate" required className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6C757D] mb-1">Currency</label>
                <input name="currency" defaultValue={entities?.currencyStated ?? "KES"} className="rounded-lg border border-gray-200 px-3 py-2 text-sm w-full" />
              </div>
              <button type="submit" className="w-full rounded-lg bg-[#06B9AB] px-4 py-2 text-sm font-medium text-white hover:bg-[#05a598]">Create draft contract</button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
