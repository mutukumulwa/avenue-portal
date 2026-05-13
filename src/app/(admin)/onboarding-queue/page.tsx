import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ArrowRight, CheckCircle, Clock } from "lucide-react";
import Link from "next/link";

const ITEM_LABEL: Record<string, string> = {
  KYC_COMPLETION:             "KYC",
  PORTAL_PROVISIONING:        "Portal",
  DIGITAL_CARD_GENERATED:     "Digital Card",
  PHYSICAL_CARD_DISPATCHED:   "Physical Card",
  WELCOME_COMMUNICATION_SENT: "Welcome",
  PROVIDER_NOTIFIED:          "Provider",
  BIOMETRIC_ENROLLED:         "Biometric",
};

export default async function OnboardingQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ gap?: string }>;
}) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;
  const { gap } = await searchParams;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get members with outstanding checklist items
  const pendingItems = await prisma.onboardingChecklistItem.findMany({
    where: {
      tenantId,
      status: "PENDING",
      ...(gap ? { itemType: gap as never } : {}),
    },
    select: { memberId: true, itemType: true },
    distinct: ["memberId"],
    take: 200,
  });

  const memberIds = [...new Set(pendingItems.map((i) => i.memberId))];

  const [members, itemsByMember] = await Promise.all([
    prisma.member.findMany({
      where: { id: { in: memberIds }, tenantId },
      select: {
        id: true, memberNumber: true, firstName: true, lastName: true,
        status: true, enrollmentDate: true, coverStartDate: true,
        group: { select: { name: true } },
      },
      orderBy: { enrollmentDate: "asc" },
    }),
    prisma.onboardingChecklistItem.findMany({
      where: { memberId: { in: memberIds }, tenantId },
      select: { memberId: true, itemType: true, status: true },
    }),
  ]);

  // Count summary by gap type
  const gapCounts: Record<string, number> = {};
  for (const item of pendingItems) {
    gapCounts[item.itemType] = (gapCounts[item.itemType] ?? 0) + 1;
  }

  const itemMap = new Map<string, Array<{ itemType: string; status: string }>>();
  for (const item of itemsByMember) {
    if (!itemMap.has(item.memberId)) itemMap.set(item.memberId, []);
    itemMap.get(item.memberId)!.push(item);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Onboarding Queue</h1>
        <p className="text-avenue-text-muted text-sm mt-1">Members with outstanding onboarding items</p>
      </div>

      {/* Gap type filters */}
      <div className="flex flex-wrap gap-2">
        <Link href="/onboarding-queue"
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${!gap ? "bg-avenue-indigo text-white border-avenue-indigo" : "border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo hover:text-avenue-indigo"}`}>
          All ({memberIds.length})
        </Link>
        {Object.entries(gapCounts).sort(([,a],[,b]) => b - a).map(([type, count]) => (
          <Link key={type} href={`/onboarding-queue?gap=${type}`}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${gap === type ? "bg-avenue-indigo text-white border-avenue-indigo" : "border-[#EEEEEE] text-avenue-text-muted hover:border-avenue-indigo hover:text-avenue-indigo"}`}>
            {ITEM_LABEL[type] ?? type} ({count})
          </Link>
        ))}
      </div>

      {members.length === 0 ? (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-12 text-center">
          <CheckCircle size={32} className="mx-auto mb-3 text-[#28A745] opacity-50" />
          <p className="text-avenue-text-muted text-sm">All members have completed onboarding{gap ? ` for this gap type` : ""}.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Group</th>
                <th className="px-5 py-3">Cover Start</th>
                <th className="px-5 py-3">Outstanding</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {members.map((m) => {
                const items = itemMap.get(m.id) ?? [];
                const pendingTypes = items.filter((i) => i.status === "PENDING").map((i) => i.itemType);
                const completedCount = items.filter((i) => i.status === "COMPLETED").length;
                const totalCount = items.length;

                return (
                  <tr key={m.id} className="hover:bg-[#F8F9FA] transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-avenue-text-heading">{m.firstName} {m.lastName}</p>
                      <p className="text-[11px] font-mono text-avenue-indigo">{m.memberNumber}</p>
                    </td>
                    <td className="px-5 py-3 text-avenue-text-body">{m.group.name}</td>
                    <td className="px-5 py-3 text-avenue-text-muted text-xs">
                      {m.coverStartDate ? new Date(m.coverStartDate).toLocaleDateString("en-KE") : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {pendingTypes.map((type) => (
                          <span key={type}
                            className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FFC107]/10 text-[#856404] flex items-center gap-1">
                            <Clock size={9} />
                            {ITEM_LABEL[type] ?? type}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 bg-[#EEEEEE] rounded-full h-1.5 w-20">
                          <div
                            className="bg-[#28A745] h-1.5 rounded-full"
                            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-avenue-text-muted">{completedCount}/{totalCount}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/members/${m.id}/onboarding`}
                        className="text-avenue-indigo hover:text-avenue-secondary font-semibold text-xs inline-flex items-center gap-1">
                        Onboard <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
