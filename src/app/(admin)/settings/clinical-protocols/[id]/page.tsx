import Link from "next/link";
import { requireRole, ROLES } from "@/lib/rbac";
import { rbacService } from "@/server/services/rbac.service";
import { ProtocolPackService } from "@/server/services/diagnosis-gate/protocol-pack.service";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { submitPackAction, activatePackAction, deactivatePackAction, setGroupEnablementAction } from "../actions";
import { ArrowLeft, ShieldCheck, Ban } from "lucide-react";

/**
 * Diagnosis Gate C3.3 — one version of the clinical content: what it contains, where it
 * is in the governed lifecycle, and the per-condition routing switches.
 *
 * The switches are the operational heart of the gate: a condition routes claims only when
 * it is enabled here AND the clinical gate is on in policy settings. Both are shown, so
 * nobody has to guess why a switch appears to do nothing.
 */
export const dynamic = "force-dynamic";

export default async function ProtocolPackDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireRole(ROLES.CLINICAL);
  const { id: userId, tenantId } = session.user;
  const { id } = await params;
  const sp = await searchParams;

  const [pack, canManage, canApprove] = await Promise.all([
    ProtocolPackService.loadPackContent(tenantId, id),
    rbacService.hasPermission(userId, "CLINICAL_PROTOCOL:MANAGE", tenantId).catch(() => false),
    rbacService.hasPermission(userId, "CLINICAL_PROTOCOL:APPROVE", tenantId).catch(() => false),
  ]);

  const stats = (pack.validationStats ?? {}) as Record<string, number>;
  const linksByGroup = new Map<string, { supported: number; confirmatory: number }>();
  for (const l of pack.links) {
    const e = linksByGroup.get(l.groupId) ?? { supported: 0, confirmatory: 0 };
    if (l.linkType === "SUPPORTED") e.supported += 1;
    else e.confirmatory += 1;
    linksByGroup.set(l.groupId, e);
  }

  const canSubmit = canManage && (pack.status === "DRAFT" || pack.status === "REJECTED");
  const canActivate = canApprove && pack.status === "APPROVED" && !pack.isActive;
  const canWithdraw = canApprove && pack.isActive;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <Link href="/settings/clinical-protocols" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All versions
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Clinical protocols — version {pack.version}
            {pack.isActive && <span className="ml-3 rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-medium text-emerald-800">In force</span>}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            From <span className="font-medium">{pack.sourceFileName}</span> · imported{" "}
            {pack.createdAt.toISOString().slice(0, 10)}
            {pack.notes ? ` · ${pack.notes}` : ""}
          </p>
        </div>
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

      {/* ── Lifecycle ────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-slate-500">Status</span>
            <div className="font-medium">{pack.status.replace(/_/g, " ").toLowerCase()}</div>
          </div>
          <div>
            <span className="text-slate-500">Approved</span>
            <div className="font-medium">{pack.approvedAt ? pack.approvedAt.toISOString().slice(0, 10) : "—"}</div>
          </div>
          <div>
            <span className="text-slate-500">Put in force</span>
            <div className="font-medium">{pack.activatedAt ? pack.activatedAt.toISOString().slice(0, 10) : "—"}</div>
          </div>
          <div>
            <span className="text-slate-500">Content checksum</span>
            <div className="font-mono text-xs">{pack.sourceChecksum.slice(0, 16)}…</div>
          </div>
        </div>

        {pack.deactivationReason && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-medium">Withdrawn:</span> {pack.deactivationReason}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {canSubmit && (
            <form action={submitPackAction}>
              <input type="hidden" name="packId" value={pack.id} />
              <SubmitButton>Send for approval</SubmitButton>
            </form>
          )}
          {pack.status === "PENDING_APPROVAL" && (
            <p className="text-sm text-slate-600">
              Waiting for a second clinician to approve this version in{" "}
              <Link href="/approvals" className="underline">
                approvals
              </Link>
              . The person who imported it cannot approve it.
            </p>
          )}
          {canActivate && (
            <form action={activatePackAction}>
              <input type="hidden" name="packId" value={pack.id} />
              <SubmitButton icon={<ShieldCheck className="h-4 w-4" aria-hidden />}>Put this version in force</SubmitButton>
            </form>
          )}
          {pack.status === "APPROVED" && !pack.isActive && !canApprove && (
            <p className="text-sm text-slate-600">Approved. A clinical approver can now put it in force.</p>
          )}
          {canWithdraw && (
            <form action={deactivatePackAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="packId" value={pack.id} />
              <div>
                <label htmlFor="reason" className="block text-xs font-medium text-slate-600">
                  Reason for withdrawing
                </label>
                <input id="reason" name="reason" required maxLength={200} className="mt-1 rounded-md border-slate-300 text-sm" placeholder="e.g. tuning after shadow review" />
              </div>
              <SubmitButton className={"bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-5 py-2 rounded-full text-sm font-semibold inline-flex items-center gap-1.5"} icon={<Ban className="h-4 w-4" aria-hidden />}>Withdraw</SubmitButton>
            </form>
          )}
        </div>
        {canWithdraw && (
          <p className="text-xs text-slate-500">
            Withdrawing leaves no content in force, so the gate passes every claim untouched. It is
            always safe.
          </p>
        )}
      </section>

      {/* ── Contents ─────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Contents</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Conditions", pack.groups.length],
            ["Diagnosis codes", stats.memberships ?? 0],
            ["Tests", pack.labRules.length],
            ["Test recognitions", pack.aliases.length],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Conditions ───────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white overflow-hidden">
        <div className="px-5 pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Conditions</h2>
          <p className="mt-1 text-sm text-slate-600 max-w-3xl">
            A condition routes flagged claims to a reviewer only when <em>routes claims</em> is on
            here <em>and</em> the clinical gate is switched on in policy settings. Until then its
            findings are recorded and reported, but no claim is diverted.
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Condition</th>
                <th className="px-5 py-2 font-medium">Code</th>
                <th className="px-5 py-2 font-medium text-right">Diagnosis codes</th>
                <th className="px-5 py-2 font-medium text-right">Supported tests</th>
                <th className="px-5 py-2 font-medium text-right">Confirmatory</th>
                <th className="px-5 py-2 font-medium">Evaluated</th>
                <th className="px-5 py-2 font-medium">Routes claims</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pack.groups.map((g) => {
                const links = linksByGroup.get(g.id) ?? { supported: 0, confirmatory: 0 };
                return (
                  <tr key={g.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{g.name}</div>
                      {g.isCatchAll && (
                        <div className="text-xs text-amber-700">Broad category — can never route claims automatically</div>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{g.groupCode}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{g._count.memberships}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{links.supported}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{links.confirmatory || <span className="text-slate-400">—</span>}</td>
                    <td className="px-5 py-3">
                      {canApprove && pack.isActive ? (
                        <form action={setGroupEnablementAction}>
                          <input type="hidden" name="packId" value={pack.id} />
                          <input type="hidden" name="groupId" value={g.id} />
                          <input type="hidden" name="field" value="enabledForShadow" />
                          <input type="hidden" name="value" value={String(!g.enabledForShadow)} />
                          <SubmitButton className={"border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5"}>{g.enabledForShadow ? "Yes" : "No"}</SubmitButton>
                        </form>
                      ) : (
                        <span>{g.enabledForShadow ? "Yes" : "No"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {g.isCatchAll ? (
                        <span className="text-slate-400" title="Broad categories are permanently excluded">
                          Never
                        </span>
                      ) : canApprove && pack.isActive ? (
                        <form action={setGroupEnablementAction}>
                          <input type="hidden" name="packId" value={pack.id} />
                          <input type="hidden" name="groupId" value={g.id} />
                          <input type="hidden" name="field" value="enabledForLive" />
                          <input type="hidden" name="value" value={String(!g.enabledForLive)} />
                          <SubmitButton className={g.enabledForLive ? "bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5" : "bg-[#0B1437] hover:bg-[#142150] disabled:opacity-50 text-white px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5"}>{g.enabledForLive ? "On" : "Off"}</SubmitButton>
                        </form>
                      ) : (
                        <span>{g.enabledForLive ? "On" : "Off"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!pack.isActive && (
          <p className="px-5 py-3 text-xs text-slate-500 border-t">
            Switches are available on the version that is in force.
          </p>
        )}
      </section>

      {/* ── Tests ────────────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white overflow-hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 px-5 pt-5">Tests</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">Test</th>
                <th className="px-5 py-2 font-medium">Needs a diagnosis</th>
                <th className="px-5 py-2 font-medium text-right">Repeat window</th>
                <th className="px-5 py-2 font-medium">Message shown to the provider</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pack.labRules.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    <div className="font-medium">{r.testName}</div>
                    <div className="font-mono text-xs text-slate-500">{r.testCode}</div>
                  </td>
                  <td className="px-5 py-3">{r.requiresDiagnosis ? "Yes" : "No"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {r.repeatWindowHours == null ? <span className="text-slate-400">—</span> : r.repeatWindowHours >= 24 ? `${Math.round(r.repeatWindowHours / 24)} d` : `${r.repeatWindowHours} h`}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{r.failureMessage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
