import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, LayoutGrid } from "lucide-react";

export const dynamic = "force-dynamic";

// Manual-review queue triage (spec §8.5) — claims the contract engine could not
// auto-process, grouped by the queue it routed them to.
const QUEUE_META: Record<string, { label: string; owner: string; slaHours: number }> = {
  NO_CONTRACT: { label: "No contract", owner: "Contract team", slaHours: 48 },
  CONTRACT_EXPIRED: { label: "Contract expired / not effective", owner: "Contract team", slaHours: 48 },
  PROVIDER_NOT_CONTRACTED: { label: "Provider not contracted", owner: "Provider relations", slaHours: 48 },
  CONTRACT_SUSPENDED: { label: "Contract suspended", owner: "Provider relations + compliance", slaHours: 24 },
  SERVICE_NOT_MAPPED: { label: "Service not mapped", owner: "Senior claims", slaHours: 24 },
  RATE_MISSING: { label: "Rate missing", owner: "Contract team", slaHours: 48 },
  RATE_AMBIGUITY: { label: "Rate ambiguity", owner: "Contract team", slaHours: 48 },
  MISSING_PREAUTH: { label: "Missing pre-authorisation", owner: "Claims + care mgmt", slaHours: 24 },
  MISSING_DOCS: { label: "Missing documents", owner: "Claims (provider follow-up)", slaHours: 72 },
  MEDICAL_REVIEW: { label: "Medical review", owner: "Medical reviewer", slaHours: 72 },
  CONTRACT_AMENDMENT_REQUIRED: { label: "Contract amendment required", owner: "Contract manager", slaHours: 120 },
  FWA_SUSPECT: { label: "Fraud / abuse suspect", owner: "Fraud team", slaHours: 24 },
};

export default async function ContractQueuesPage() {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;

  const grouped = await prisma.claim.groupBy({
    by: ["assignedQueue"],
    where: { tenantId, assignedQueue: { not: null } },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map(g => [g.assignedQueue!, g._count._all]));

  const claims = await prisma.claim.findMany({
    where: { tenantId, assignedQueue: { not: null } },
    select: { id: true, claimNumber: true, assignedQueue: true, billedAmount: true, provider: { select: { name: true } }, receivedAt: true },
    orderBy: { receivedAt: "asc" },
    take: 300,
  });
  const byQueue = new Map<string, typeof claims>();
  for (const c of claims) {
    const q = c.assignedQueue!;
    if (!byQueue.has(q)) byQueue.set(q, []);
    byQueue.get(q)!.push(c);
  }

  const queueKeys = [...new Set([...counts.keys()])].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/contracts" className="inline-flex items-center gap-1 text-sm text-[#6C757D] hover:text-[#06B9AB] mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to contracts
      </Link>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-[#000523] mb-1">
        <LayoutGrid className="w-6 h-6 text-[#06B9AB]" /> Contract review queues
      </h1>
      <p className="text-sm text-[#6C757D] mb-6">Claims the contract engine could not auto-process, grouped by the reason they need manual review. {claims.length} in queue.</p>

      {queueKeys.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-[#6C757D]">No claims are currently queued by the contract engine.</div>
      ) : (
        <div className="space-y-4">
          {queueKeys.map(q => {
            const meta = QUEUE_META[q] ?? { label: q.replace(/_/g, " "), owner: "—", slaHours: 48 };
            const items = byQueue.get(q) ?? [];
            return (
              <section key={q} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[#000523]">{meta.label} <span className="ml-2 rounded-full bg-[#000523] px-2 py-0.5 text-xs text-white">{counts.get(q)}</span></h2>
                    <p className="text-xs text-[#6C757D]">Owner: {meta.owner} · SLA {meta.slaHours}h</p>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-left text-[#6C757D]"><tr><th className="py-1">Claim</th><th className="py-1">Provider</th><th className="py-1 text-right">Billed</th><th className="py-1 text-right">Age (d)</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.slice(0, 15).map(c => {
                      const ageDays = Math.floor((Date.now() - c.receivedAt.getTime()) / 86_400_000);
                      return (
                        <tr key={c.id}>
                          <td className="py-1"><Link href={`/claims/${c.id}`} className="text-[#06B9AB]">{c.claimNumber}</Link></td>
                          <td className="py-1 text-[#000523]">{c.provider.name}</td>
                          <td className="py-1 text-right">{Number(c.billedAmount).toLocaleString()}</td>
                          <td className={`py-1 text-right ${ageDays * 24 > meta.slaHours ? "text-[#DC3545] font-medium" : "text-[#6C757D]"}`}>{ageDays}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
