import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, FileSignature, GitBranch } from "lucide-react";
import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";
import { ManagePanel } from "./ManagePanel";
import {
  submitForReviewAction,
  approveContractAction,
  requestClarificationAction,
  returnToDraftAction,
  activateContractAction,
  suspendContractAction,
  reinstateContractAction,
  terminateContractAction,
  renewContractAction,
} from "../actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[#FFC107]/10 text-[#856404]",
  UNDER_REVIEW: "bg-[#17A2B8]/10 text-[#0c6472]",
  PENDING_CLARIFICATION: "bg-[#FD7E14]/10 text-[#9a4b06]",
  APPROVED: "bg-[#6610F2]/10 text-[#4409a8]",
  ACTIVE: "bg-[#28A745]/10 text-[#28A745]",
  SUSPENDED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED: "bg-[#6C757D]/10 text-[#6C757D]",
  TERMINATED: "bg-[#DC3545]/10 text-[#DC3545]",
  SUPERSEDED: "bg-[#6C757D]/10 text-[#6C757D]",
  ARCHIVED: "bg-[#6C757D]/10 text-[#6C757D]",
};

function Term({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[#6C757D]">{k}</dt>
      <dd className="text-sm text-[#000523]">{v ?? "—"}</dd>
    </div>
  );
}

/** A lifecycle action rendered as a server-action form button. */
function ActionButton({
  action, id, label, cls, extra,
}: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  label: string;
  cls: string;
  extra?: React.ReactNode;
}) {
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      {extra}
      <button type="submit" className={`rounded-lg px-3 py-1.5 text-sm font-medium ${cls}`}>{label}</button>
    </form>
  );
}

export default async function ContractDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { id } = await params;
  const { error } = await searchParams;
  const tenantId = session.user.tenantId;

  const c = await prisma.providerContract.findUnique({
    where: { id, tenantId },
    include: {
      provider: { select: { id: true, name: true, legalName: true } },
      parentContract: { select: { id: true, contractNumber: true, title: true } },
      children: { select: { id: true, contractNumber: true, title: true, status: true } },
      applicability: { where: { isActive: true }, include: { client: { select: { name: true } } } },
      contractBranches: { include: { branch: { select: { name: true } } } },
      versions: { orderBy: { versionNumber: "desc" } },
      _count: { select: { tariffLines: true, claims: true } },
    },
  });
  if (!c) notFound();

  const validation = await ContractLifecycleService.validate(tenantId, id);
  const now = new Date();
  const display = c.status === "ACTIVE" && c.endDate < now ? "EXPIRED" : c.status;

  // Renewal is offered once a contract is in force or past its window (§4.4).
  const renewEligible = ["ACTIVE", "EXPIRED", "TERMINATED"].includes(c.status) || display === "EXPIRED";
  const renewStart = new Date(c.endDate.getTime() + 86_400_000).toISOString().slice(0, 10);
  const renewEnd = new Date(new Date(c.endDate).setFullYear(c.endDate.getFullYear() + 1) + 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/contracts" className="inline-flex items-center gap-1 text-sm text-[#6C757D] hover:text-[#06B9AB] mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to contracts
      </Link>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#DC3545]/10 px-4 py-3 text-sm text-[#DC3545]">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <FileSignature className="w-7 h-7 text-[#06B9AB] mt-1" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-[#000523]">{c.contractNumber}</h1>
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[display] ?? ""}`}>
                {display.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-sm text-[#6C757D]">{c.title}</p>
            <p className="text-xs text-[#6C757D] mt-0.5">
              {c.provider.name}
              {c.provider.legalName && c.provider.legalName !== c.provider.name ? ` (${c.provider.legalName})` : ""}
              {" · "}{c.startDate.toISOString().slice(0, 10)} → {c.endDate.toISOString().slice(0, 10)}
            </p>
          </div>
        </div>
      </div>

      {/* Lifecycle action bar (spec §4.2) */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <span className="text-xs font-medium text-[#6C757D] mr-1">Actions:</span>
        {c.status === "DRAFT" && (
          <ActionButton action={submitForReviewAction} id={c.id} label="Submit for review" cls="bg-[#17A2B8] text-white hover:bg-[#138496]" />
        )}
        {c.status === "UNDER_REVIEW" && (
          <>
            <ActionButton action={approveContractAction} id={c.id} label="Approve" cls="bg-[#28A745] text-white hover:bg-[#218838]" />
            <ActionButton
              action={requestClarificationAction}
              id={c.id}
              label="Request clarification"
              cls="bg-[#FD7E14] text-white hover:bg-[#e56f0c]"
              extra={<input name="comment" placeholder="Comment…" className="mr-2 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />}
            />
            <ActionButton action={returnToDraftAction} id={c.id} label="Reject to draft" cls="bg-gray-100 text-[#6C757D] hover:bg-gray-200" />
          </>
        )}
        {c.status === "PENDING_CLARIFICATION" && (
          <ActionButton action={submitForReviewAction} id={c.id} label="Resubmit for review" cls="bg-[#17A2B8] text-white hover:bg-[#138496]" />
        )}
        {c.status === "APPROVED" && (
          <>
            <ActionButton
              action={activateContractAction}
              id={c.id}
              label="Activate"
              cls="bg-[#28A745] text-white hover:bg-[#218838]"
              extra={
                <label className="mr-2 inline-flex items-center gap-1 text-xs text-[#6C757D]">
                  <input type="checkbox" name="allowUnsigned" /> allow unsigned
                </label>
              }
            />
            <ActionButton action={returnToDraftAction} id={c.id} label="Withdraw to draft" cls="bg-gray-100 text-[#6C757D] hover:bg-gray-200" />
          </>
        )}
        {c.status === "ACTIVE" && (
          <>
            <ActionButton action={suspendContractAction} id={c.id} label="Suspend" cls="bg-[#FFC107] text-[#856404] hover:bg-[#e0a800]" />
            <ActionButton action={terminateContractAction} id={c.id} label="Terminate" cls="bg-[#DC3545] text-white hover:bg-[#c82333]" />
          </>
        )}
        {c.status === "SUSPENDED" && (
          <>
            <ActionButton action={reinstateContractAction} id={c.id} label="Reinstate" cls="bg-[#28A745] text-white hover:bg-[#218838]" />
            <ActionButton action={terminateContractAction} id={c.id} label="Terminate" cls="bg-[#DC3545] text-white hover:bg-[#c82333]" />
          </>
        )}
      </div>

      {/* Renewal (spec §4.4) — clones the full contract into a new DRAFT for the next period */}
      {renewEligible && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          {c.supersededById ? (
            <p className="text-sm text-[#6C757D]">
              Already renewed →{" "}
              <Link href={`/contracts/${c.supersededById}`} className="text-[#06B9AB] underline">successor contract</Link>.
            </p>
          ) : (
            <form action={renewContractAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={c.id} />
              <div>
                <span className="block text-xs font-medium text-[#6C757D] mb-1">Renew for the next period</span>
                <span className="text-xs text-[#6C757D]">Clones tariffs, rules, packages, applicability &amp; branches into a new DRAFT.</span>
              </div>
              <label className="text-xs text-[#6C757D]">Start<input type="date" name="startDate" required defaultValue={renewStart} className="block rounded-lg border border-gray-200 px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-[#6C757D]">End<input type="date" name="endDate" required defaultValue={renewEnd} className="block rounded-lg border border-gray-200 px-2 py-1.5 text-sm" /></label>
              <label className="text-xs text-[#6C757D]">Uplift %<input type="number" step="0.1" name="upliftPct" defaultValue={0} className="block w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm" /></label>
              <button type="submit" className="rounded-lg bg-[#6610F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#560bd0]">Renew</button>
            </form>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Left: overview */}
        <div className="col-span-2 space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#000523] mb-4">Overview</h2>
            <dl className="grid grid-cols-3 gap-4">
              <Term k="Type" v={c.contractType.replace(/_/g, " ")} />
              <Term k="Execution" v={c.executionStatus.replace(/_/g, " ")} />
              <Term k="Branch scope" v={c.branchScope.replace(/_/g, " ")} />
              <Term k="Currency" v={c.currency} />
              <Term k="Payment term" v={`${c.paymentTermDays} ${c.paymentTermType === "BUSINESS" ? "business" : "calendar"} days`} />
              <Term k="External ref" v={c.externalContractRef} />
              <Term k="Submission window" v={c.submissionWindowDays ? `${c.submissionWindowDays}d (${(c.submissionWindowBasis ?? "").replace(/_/g, " ").toLowerCase()})` : "—"} />
              <Term k="Balance billing" v={c.balanceBillingPolicy?.replace(/_/g, " ")} />
              <Term k="Tax" v={c.taxInclusive} />
              <Term k="Reconciliation" v={c.reconciliationCadence} />
              <Term k="Unlisted rule" v={c.unlistedServiceRule.replace(/_/g, " ")} />
              <Term k="Review due" v={c.reviewDueDate?.toISOString().slice(0, 10)} />
            </dl>
            {c.notes && <p className="mt-4 text-sm text-[#6C757D] whitespace-pre-wrap">{c.notes}</p>}
          </section>

          {/* Family tree (spec §11.2) */}
          {(c.parentContract || c.children.length > 0) && (
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#000523] mb-3">
                <GitBranch className="w-4 h-4" /> Contract family
              </h2>
              {c.parentContract && (
                <p className="text-sm">
                  Parent:{" "}
                  <Link href={`/contracts/${c.parentContract.id}`} className="text-[#06B9AB] underline">
                    {c.parentContract.contractNumber}
                  </Link>{" "}
                  <span className="text-[#6C757D]">{c.parentContract.title}</span>
                  {!c.parentDigitised && <span className="ml-2 rounded bg-[#FD7E14]/10 px-1.5 py-0.5 text-xs text-[#9a4b06]">parent not digitised</span>}
                </p>
              )}
              {c.children.map(ch => (
                <p key={ch.id} className="text-sm mt-1">
                  Child:{" "}
                  <Link href={`/contracts/${ch.id}`} className="text-[#06B9AB] underline">{ch.contractNumber}</Link>{" "}
                  <span className="text-[#6C757D]">{ch.title}</span>
                </p>
              ))}
            </section>
          )}

          {/* Applicability + branches */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#000523] mb-3">Applicability & scope</h2>
            <div className="text-sm">
              <p className="text-xs text-[#6C757D] mb-1">Payers / schemes ({c.applicability.length})</p>
              {c.applicability.length === 0 ? (
                <p className="text-[#6C757D]">No applicability rows — this contract will not activate (V1).</p>
              ) : (
                <ul className="list-disc pl-5">
                  {c.applicability.map(a => (
                    <li key={a.id}>
                      {a.inclusionType === "EXCLUDE" ? "Exclude " : ""}{a.client.name}
                      {a.benefitCategory ? ` · ${a.benefitCategory}` : ""}
                      {a.memberCategory ? ` · ${a.memberCategory}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {c.branchScope === "LISTED" && (
                <>
                  <p className="text-xs text-[#6C757D] mt-3 mb-1">Listed branches ({c.contractBranches.length})</p>
                  <p>{c.contractBranches.map(b => b.branch.name).join(", ") || "None attached"}</p>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Right: validation + version + counts */}
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#000523] mb-3">Activation validation (§13)</h2>
            {validation.ok && validation.issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-[#28A745]"><CheckCircle2 className="w-4 h-4" /> All checks pass.</p>
            ) : (
              <ul className="space-y-2">
                {validation.issues.map((iss, i) => (
                  <li key={i} className={`text-xs ${iss.severity === "ERROR" ? "text-[#DC3545]" : "text-[#9a4b06]"}`}>
                    <span className="font-semibold">{iss.rule} {iss.severity === "ERROR" ? "✕" : "!"}</span> {iss.message}
                  </li>
                ))}
                {validation.ok && <li className="text-xs text-[#28A745]">No blocking errors — warnings only.</li>}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#000523] mb-3">Versions</h2>
            {c.versions.length === 0 ? (
              <p className="text-xs text-[#6C757D]">No versions yet — version 1 is created on activation.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {c.versions.map(v => (
                  <li key={v.id} className="flex justify-between">
                    <span>v{v.versionNumber} · {v.status}</span>
                    <span className="text-[#6C757D]">{v.effectiveFrom.toISOString().slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-[#000523] mb-3">At a glance</h2>
            <dl className="space-y-2 text-sm">
              <Term k="Tariff lines" v={c._count.tariffLines} />
              <Term k="Claims priced" v={c._count.claims} />
            </dl>
          </section>
        </div>
      </div>

      {/* Management widgets — tariffs, applicability, branches, rules, exclusions (§11.2/§11.4/§11.5) */}
      <ManagePanel
        contractId={c.id}
        providerId={c.provider.id}
        branchScope={c.branchScope}
        editable={c.status === "DRAFT" || c.status === "PENDING_CLARIFICATION"}
      />
    </div>
  );
}
