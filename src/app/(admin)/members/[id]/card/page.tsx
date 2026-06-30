import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, CreditCard } from "lucide-react";
import { CardManagementPanel } from "./CardManagementPanel";

const CARD_STATUS_STYLE: Record<string, string> = {
  PENDING_ISSUANCE: "bg-[#FFC107]/10 text-[#856404]",
  ISSUED:     "bg-[#17A2B8]/10 text-[#17A2B8]",
  DISPATCHED: "bg-[#0B1437]/10 text-[#0B1437]",
  DELIVERED:  "bg-[#28A745]/10 text-[#28A745]",
  ACTIVATED:  "bg-[#28A745]/10 text-[#28A745]",
  LOST:       "bg-[#DC3545]/10 text-[#DC3545]",
  DAMAGED:    "bg-[#DC3545]/10 text-[#DC3545]",
  REPLACED:   "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function MemberCardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { id }  = await params;
  const tenantId = session.user.tenantId;

  const [member, membershipCards] = await Promise.all([
    prisma.member.findUnique({
      where: { id, tenantId },
      select: {
        id: true, firstName: true, lastName: true,
        memberNumber: true, smartCardNumber: true,
        activityLogs: {
          where: { action: { in: ["CARD_ISSUED", "CARD_REISSUED", "CARD_REPLACEMENT_REQUESTED"] } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, action: true, description: true, createdAt: true },
        },
      },
    }),
    prisma.membershipCard.findMany({
      where: { memberId: id, tenantId },
      orderBy: [{ isActive: "desc" }, { issuedAt: "desc" }],
    }),
  ]);
  if (!member) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/members/${id}`} className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">
            Cards — {member.firstName} {member.lastName}
          </h1>
          <p className="text-brand-text-body text-sm mt-0.5 font-mono">{member.memberNumber}</p>
        </div>
        <Link href={`/members/${id}/onboarding`}
          className="ml-auto text-xs font-semibold text-brand-indigo border border-brand-indigo/30 hover:bg-brand-indigo/5 px-3 py-1.5 rounded-full transition-colors">
          Onboarding →
        </Link>
      </div>

      {/* MembershipCard records (new model) */}
      {membershipCards.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#EEEEEE] flex items-center gap-2">
            <CreditCard size={15} className="text-brand-indigo" />
            <h2 className="font-semibold text-brand-text-heading text-sm">Card Register</h2>
          </div>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#E6E7E8] text-xs text-[#6C757D] font-semibold">
                <th className="px-5 py-2">Type</th>
                <th className="px-5 py-2">Card Number</th>
                <th className="px-5 py-2">Status</th>
                <th className="px-5 py-2">Issued</th>
                <th className="px-5 py-2">Expires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {membershipCards.map((card) => (
                <tr key={card.id} className={`hover:bg-[#F8F9FA] ${!card.isActive ? "opacity-50" : ""}`}>
                  <td className="px-5 py-2.5 font-semibold text-brand-text-heading">{card.cardType}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-brand-text-muted">{card.cardNumber ?? "—"}</td>
                  <td className="px-5 py-2.5">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${CARD_STATUS_STYLE[card.status] ?? ""}`}>
                      {card.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-brand-text-muted text-xs">
                    {card.issuedAt ? new Date(card.issuedAt).toLocaleDateString("en-KE") : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-brand-text-muted text-xs">
                    {card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("en-KE") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legacy smart card panel */}
      <CardManagementPanel
        memberId={member.id}
        currentCardNumber={member.smartCardNumber ?? null}
        activityLogs={member.activityLogs.map(l => ({
          id: l.id,
          action: l.action,
          description: l.description,
          createdAt: l.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
