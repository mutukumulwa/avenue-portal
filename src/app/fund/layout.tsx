import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { FundSidebar } from "@/components/layouts/FundSidebar";

export default async function FundLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(ROLES.FUND);
  const tenantId = session.user.tenantId;

  // Fetch all SELF_FUNDED groups this user administers (or all if SUPER_ADMIN)
  const groups = await prisma.group.findMany({
    where: {
      tenantId,
      fundingMode: "SELF_FUNDED",
      ...(session.user.role === "SUPER_ADMIN"
        ? {}
        : { fundAdministrators: { some: { id: session.user.id } } }),
    },
    select: {
      id: true,
      name: true,
      selfFundedAccount: { select: { balance: true, minimumBalance: true } },
    },
    orderBy: { name: "asc" },
  });

  const schemes = groups.map(g => ({
    id: g.id,
    name: g.name,
    balance: Number(g.selfFundedAccount?.balance ?? 0),
    isLow: g.selfFundedAccount
      ? Number(g.selfFundedAccount.balance) < Number(g.selfFundedAccount.minimumBalance)
      : false,
  }));

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <FundSidebar schemes={schemes} />
      <div className="flex-1 ml-64 p-8">
        {children}
      </div>
    </div>
  );
}
