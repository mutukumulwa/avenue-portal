import Link from "next/link";
import { requireRole, ROLES } from "@/lib/rbac";
import { hasClinicalCapability, CLINICAL_PROTOCOL_MANAGE } from "@/server/services/diagnosis-gate/authorisation";
import { ProtocolPackService } from "@/server/services/diagnosis-gate/protocol-pack.service";
import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { importPackAction } from "./actions";
import { Stethoscope, ShieldCheck, Upload, AlertTriangle } from "lucide-react";

/**
 * Diagnosis Gate C3.2 — clinical protocol library.
 *
 * Lists every version of the clinical content, shows which one is in force, and provides
 * the import door. The lifecycle actions live on the detail page.
 *
 * No clinical detail is shown here beyond condition and test counts — this is a
 * governance screen, not a clinical reference.
 */
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-rose-100 text-rose-700",
  SUPERSEDED: "bg-slate-100 text-slate-500",
  DEACTIVATED: "bg-slate-100 text-slate-500",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
  DEACTIVATED: "Withdrawn",
};

export default async function ClinicalProtocolsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const session = await requireRole(ROLES.CLINICAL);
  const { id: userId, tenantId } = session.user;
  const sp = await searchParams;

  const [packs, canManage, activeGroups] = await Promise.all([
    ProtocolPackService.listPacks(tenantId),
    hasClinicalCapability(userId, session.user.role, CLINICAL_PROTOCOL_MANAGE, tenantId),
    prisma.clinicalInterventionGroup.count({ where: { pack: { tenantId, isActive: true }, enabledForLive: true } }),
  ]);

  const active = packs.find((p) => p.isActive) ?? null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-teal-600" aria-hidden />
          Clinical protocols
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          The clinical rules the diagnosis gate checks claims against. Content is imported as a
          version, approved by a second clinician, then deliberately put in force. Nothing here
          changes how claims are decided until the clinical gate is switched on in{" "}
          <Link href="/settings/auto-adjudication" className="underline">
            auto-adjudication settings
          </Link>
          .
        </p>
      </header>

      {sp?.error && (
        <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {sp.error}
        </div>
      )}
      {sp?.ok && (
        <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {sp.ok}
        </div>
      )}

      {/* ── What is in force ─────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" aria-hidden /> In force now
        </h2>
        {active ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <div className="text-2xl font-semibold">Version {active.version}</div>
              <div className="text-xs text-slate-500">{active.sourceFileName}</div>
            </div>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Conditions</dt>
                <dd className="font-medium tabular-nums">{active._count.groups}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Diagnosis codes</dt>
                <dd className="font-medium tabular-nums">{active._count.memberships}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Tests</dt>
                <dd className="font-medium tabular-nums">{active._count.labRules}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Routing claims</dt>
                <dd className="font-medium tabular-nums">
                  {activeGroups === 0 ? <span className="text-slate-500">no conditions — recording only</span> : `${activeGroups} condition(s)`}
                </dd>
              </div>
            </dl>
            <Link href={`/settings/clinical-protocols/${active.id}`} className="ml-auto text-sm font-medium text-teal-700 hover:underline">
              Open version {active.version} →
            </Link>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            No clinical content is in force. The diagnosis gate is dormant: every claim passes it
            untouched.
          </p>
        )}
      </section>

      {/* ── Import ───────────────────────────────────────────────────────── */}
      {canManage && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
            <Upload className="h-4 w-4" aria-hidden /> Import a new version
          </h2>
          <p className="mt-2 text-sm text-slate-600 max-w-3xl">
            Upload the pack file produced by the workbook converter. Every condition, code, test and
            message is read from that file — nothing is filled in for you, and a file with unresolved
            gaps is rejected with a list of what to fix.
          </p>
          <form action={importPackAction} className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="packFile" className="block text-sm font-medium text-slate-700">
                Pack file (.json)
              </label>
              <input
                id="packFile"
                name="packFile"
                type="file"
                accept="application/json,.json"
                required
                className="mt-1 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
              />
            </div>
            <div className="flex-1 min-w-64">
              <label htmlFor="notes" className="block text-sm font-medium text-slate-700">
                What changed (optional)
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                maxLength={300}
                placeholder="e.g. added confirmatory tests for malaria"
                className="mt-1 w-full rounded-md border-slate-300 text-sm"
              />
            </div>
            <SubmitButton>Import as draft</SubmitButton>
          </form>
        </section>
      )}

      {/* ── Versions ─────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white overflow-hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 px-5 pt-5">Versions</h2>
        {packs.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-600">
            No clinical content has been imported yet.
            {canManage ? " Use the import form above to add the first version." : " A clinical officer can import the first version."}
          </p>
        ) : (
          <div className="min-w-0 mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Version</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                  <th className="px-5 py-2 font-medium">Source</th>
                  <th className="px-5 py-2 font-medium text-right">Conditions</th>
                  <th className="px-5 py-2 font-medium text-right">Codes</th>
                  <th className="px-5 py-2 font-medium text-right">Tests</th>
                  <th className="px-5 py-2 font-medium">Imported</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {packs.map((p) => (
                  <tr key={p.id} className={p.isActive ? "bg-emerald-50/40" : undefined}>
                    <td className="px-5 py-3 font-medium">
                      v{p.version}
                      {p.isActive && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">In force</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status] ?? "bg-slate-100 text-slate-700"}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{p.sourceFileName}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{p._count.groups}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{p._count.memberships}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{p._count.labRules}</td>
                    <td className="px-5 py-3 text-slate-600">{p.createdAt.toISOString().slice(0, 10)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/settings/clinical-protocols/${p.id}`} className="font-medium text-teal-700 hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-slate-500">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
        <span>
          Clinical findings never decline a claim. They route it to a person, who decides. The one
          exception — not paying a test repeated inside its clinical window — is switched off and
          requires its own sign-off.
        </span>
      </p>
    </div>
  );
}
