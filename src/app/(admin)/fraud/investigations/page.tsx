import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { assignInvestigationAction, resolveInvestigationAction } from "./actions";
import { Search } from "lucide-react";

export default async function FraudInvestigationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; closed?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const { error, closed } = await searchParams;
  const tenantId = session.user.tenantId;
  const showClosed = closed === "true";

  const investigations = await prisma.fraudInvestigation.findMany({
    where: {
      tenantId,
      status: showClosed ? { in: ["SUBSTANTIATED", "DISMISSED"] } : { in: ["OPEN", "IN_PROGRESS"] },
    },
    orderBy: { openedAt: "desc" },
    take: 100,
  });

  const claimIds = investigations.map((i) => i.claimId).filter((id): id is string => !!id);
  const claims = claimIds.length
    ? await prisma.claim.findMany({
        where: { id: { in: claimIds } },
        select: { id: true, claimNumber: true },
      })
    : [];
  const claimNumber = new Map(claims.map((c) => [c.id, c.claimNumber]));

  const userIds = investigations.map((i) => i.assigneeId).filter((id): id is string => !!id);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const userName = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

  const inputCls =
    "rounded-md border border-brand-border bg-brand-bg px-2 py-1.5 text-xs text-brand-text-body focus:border-brand-teal focus:outline-none";

  const statusBadge = (s: string) =>
    s === "SUBSTANTIATED" ? "bg-brand-error/10 text-brand-error"
    : s === "DISMISSED" ? "bg-brand-text-muted/10 text-brand-text-muted"
    : s === "IN_PROGRESS" ? "bg-brand-indigo/10 text-brand-indigo"
    : "bg-[#FFC107]/15 text-[#856404]";

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Search className="h-6 w-6 text-brand-secondary" />
          <div>
            <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Fraud Investigations</h1>
            <p className="text-sm text-brand-text-muted">
              Case workflow over fraud alerts: open → assign → substantiate or dismiss with findings.
              Open one from an alert on the Fraud Alert Desk.
            </p>
          </div>
        </div>
        <Link
          href={showClosed ? "/fraud/investigations" : "/fraud/investigations?closed=true"}
          className="rounded-full border border-brand-border px-4 py-2 text-sm font-semibold text-brand-text-body hover:bg-brand-bg-alt"
        >
          {showClosed ? "View open" : "View closed"}
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Opened</th>
              <th className="px-4 py-2.5">Claim</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Assignee</th>
              <th className="px-4 py-2.5">{showClosed ? "Findings / outcome" : "Actions"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {investigations.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-brand-text-muted">
                {showClosed ? "No closed investigations." : "No open investigations."}
              </td></tr>
            ) : investigations.map((inv) => (
              <tr key={inv.id}>
                <td className="px-4 py-2.5 text-brand-text-body">{new Date(inv.openedAt).toLocaleDateString("en-UG")}</td>
                <td className="px-4 py-2.5">
                  {inv.claimId ? (
                    <Link href={`/claims/${inv.claimId}`} className="font-medium text-brand-indigo hover:underline">
                      {claimNumber.get(inv.claimId) ?? inv.claimId}
                    </Link>
                  ) : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadge(inv.status)}`}>
                    {inv.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-brand-text-body">{inv.assigneeId ? (userName.get(inv.assigneeId) ?? "…") : "Unassigned"}</td>
                <td className="px-4 py-2.5">
                  {showClosed ? (
                    <span className="text-xs text-brand-text-muted">{inv.findings ?? "—"}{inv.outcome ? ` → ${inv.outcome}` : ""}</span>
                  ) : (
                    <form action={resolveInvestigationAction} className="flex flex-col gap-2 min-w-[220px]">
                      <input type="hidden" name="id" value={inv.id} />
                      <div className="flex gap-2">
                        <input name="findings" placeholder="Findings" className={`${inputCls} flex-1`} />
                        <input name="outcome" placeholder="Outcome" className={`${inputCls} flex-1`} />
                      </div>
                      <div className="flex items-center gap-3">
                        {inv.status === "OPEN" && (
                          <button formAction={assignInvestigationAction} name="id" value={inv.id} className="text-xs font-semibold text-brand-indigo hover:underline">Take it</button>
                        )}
                        <button name="status" value="SUBSTANTIATED" className="text-xs font-semibold text-brand-error hover:underline">Substantiate</button>
                        <button name="status" value="DISMISSED" className="text-xs font-semibold text-brand-text-muted hover:underline">Dismiss</button>
                      </div>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
