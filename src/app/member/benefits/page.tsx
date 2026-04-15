import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function MemberBenefitsPage() {
  const session = await requireRole(ROLES.MEMBER);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      member: {
        include: {
          package: {
            include: {
              currentVersion: { include: { benefits: { orderBy: { category: "asc" } } } },
            },
          },
          benefitUsages: {
            include: { benefitConfig: { select: { category: true, annualSubLimit: true } } },
          },
        },
      },
    },
  });

  const member = user?.member;
  if (!member) redirect("/login");

  const benefits = member.package.currentVersion?.benefits ?? [];
  const usageMap = member.benefitUsages.reduce<Record<string, number>>((acc, u) => {
    acc[u.benefitConfigId] = Number(u.amountUsed);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-avenue-text-heading">My Benefits</h1>
        <p className="text-avenue-text-muted mt-1">{member.package.name} · Annual benefit schedule</p>
      </div>

      <div className="space-y-3">
        {benefits.map((b) => {
          const used = usageMap[b.id] ?? 0;
          const limit = Number(b.annualSubLimit);
          const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
          const remaining = Math.max(0, limit - used);

          return (
            <div key={b.id} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h2 className="font-bold text-avenue-text-heading">{b.customCategoryName ?? b.category.replace(/_/g, " ")}</h2>
                  {b.notes && <p className="text-xs text-avenue-text-muted mt-0.5">{b.notes}</p>}
                </div>
                <div className="text-right text-sm">
                  <p className="font-bold text-avenue-indigo">KES {limit.toLocaleString()}</p>
                  <p className="text-xs text-avenue-text-muted">annual limit</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-[#E6E7E8] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-[#DC3545]" : pct >= 70 ? "bg-[#FFC107]" : "bg-[#28A745]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex justify-between text-xs text-avenue-text-muted mt-2">
                <span>Used: KES {used.toLocaleString()}</span>
                <span>Remaining: <span className="font-bold text-avenue-text-heading">KES {remaining.toLocaleString()}</span></span>
              </div>

              {b.waitingPeriodDays > 0 && (
                <p className="text-xs text-orange-500 mt-2">⚠ Waiting period: {b.waitingPeriodDays} days</p>
              )}
              {Number(b.copayPercentage) > 0 && (
                <p className="text-xs text-avenue-text-muted mt-1">Co-pay: {Number(b.copayPercentage)}%</p>
              )}
            </div>
          );
        })}

        {benefits.length === 0 && (
          <div className="bg-white border border-[#EEEEEE] rounded-lg p-8 text-center text-avenue-text-body shadow-sm">
            No benefit schedule configured. Please contact support.
          </div>
        )}
      </div>
    </div>
  );
}
