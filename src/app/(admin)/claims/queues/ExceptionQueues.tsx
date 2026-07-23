import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getReason, isRouteCode } from "@/server/services/claim-intake/reason-catalog";

/**
 * F6.4 — named autopilot exception queues (§12.3): humans work ROUTED claims by
 * queue + route code (with the remedy and age) instead of trawling everything
 * RECEIVED. A claim leaves the active queue the moment it is DECIDED — the
 * filter keys on pre-decision statuses.
 */
const ACTIVE_STATUSES = ["RECEIVED", "CAPTURED", "UNDER_REVIEW"] as const;

function ageLabel(from: Date): string {
  const h = Math.floor((Date.now() - from.getTime()) / 3_600_000);
  if (h < 1) return "<1 h";
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export async function ExceptionQueues({ tenantId, queue, route }: { tenantId: string; queue?: string; route?: string }) {
  const grouped = await prisma.claim.groupBy({
    by: ["assignedQueue", "processingRouteCode"],
    where: { tenantId, status: { in: [...ACTIVE_STATUSES] }, assignedQueue: { not: null }, processingState: { in: ["ROUTED", "SHADOW_COMPLETE", "FAILED"] } },
    _count: { _all: true },
    _min: { receivedAt: true },
  });

  const byQueue = new Map<string, { total: number; oldest: Date | null; routes: Array<{ code: string; count: number }> }>();
  for (const g of grouped) {
    const q = g.assignedQueue ?? "UNASSIGNED";
    const row = byQueue.get(q) ?? { total: 0, oldest: null, routes: [] };
    row.total += g._count._all;
    if (g._min.receivedAt && (!row.oldest || g._min.receivedAt < row.oldest)) row.oldest = g._min.receivedAt;
    if (g.processingRouteCode) row.routes.push({ code: g.processingRouteCode, count: g._count._all });
    byQueue.set(q, row);
  }
  const queues = [...byQueue.entries()].sort((a, b) => b[1].total - a[1].total);

  const selected = queue
    ? await prisma.claim.findMany({
        where: {
          tenantId,
          status: { in: [...ACTIVE_STATUSES] },
          assignedQueue: queue,
          ...(route ? { processingRouteCode: route } : {}),
        },
        orderBy: { receivedAt: "asc" },
        take: 50,
        select: {
          id: true, claimNumber: true, processingRouteCode: true, receivedAt: true, billedAmount: true, currency: true,
          member: { select: { firstName: true, lastName: true } },
          provider: { select: { name: true } },
        },
      })
    : [];

  if (queues.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase text-brand-text-muted">Autopilot exception queues</h2>
      <div className="flex flex-wrap gap-2">
        {queues.map(([q, info]) => (
          <Link
            key={q}
            href={`/claims/queues?queue=${encodeURIComponent(q)}`}
            className={`rounded-lg border px-3 py-2 text-sm ${queue === q ? "border-brand-teal bg-brand-teal/5" : "border-brand-border bg-brand-bg hover:border-brand-teal"}`}
          >
            <span className="font-semibold text-brand-text-heading">{q.replace(/_/g, " ")}</span>{" "}
            <span className="text-brand-text-muted">· {info.total}</span>
            {info.oldest && <span className="ml-1.5 text-[10px] text-brand-text-muted">oldest {ageLabel(info.oldest)}</span>}
          </Link>
        ))}
        {queue && (
          <Link href="/claims/queues" className="self-center text-xs font-semibold text-brand-text-muted hover:underline">
            clear
          </Link>
        )}
      </div>

      {queue && (
        <div className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-border px-4 py-2.5">
            {byQueue.get(queue)?.routes.map((r) => (
              <Link
                key={r.code}
                href={`/claims/queues?queue=${encodeURIComponent(queue)}&route=${encodeURIComponent(r.code)}`}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-mono ${route === r.code ? "border-brand-teal text-brand-teal" : "border-brand-border text-brand-text-muted hover:border-brand-teal"}`}
              >
                {r.code} · {r.count}
              </Link>
            ))}
            {route && isRouteCode(route) && (
              <span className="w-full text-xs text-brand-text-muted"><span className="font-semibold">Remedy:</span> {getReason(route).remedy}</span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
              <tr>
                <th className="px-4 py-2">Claim</th>
                <th className="px-4 py-2">Route</th>
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Facility</th>
                <th className="px-4 py-2">Billed</th>
                <th className="px-4 py-2">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {selected.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">
                    <Link href={`/claims/${c.id}`} className="font-mono text-xs font-semibold text-brand-teal hover:underline">{c.claimNumber}</Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-[10px]">{c.processingRouteCode ?? "—"}</td>
                  <td className="px-4 py-2">{c.member.firstName} {c.member.lastName}</td>
                  <td className="px-4 py-2 text-brand-text-muted">{c.provider.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{Number(c.billedAmount).toLocaleString()} {c.currency}</td>
                  <td className="px-4 py-2 text-brand-text-muted">{ageLabel(c.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
