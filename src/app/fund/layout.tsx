import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { FundSidebar } from "@/components/layouts/FundSidebar";
import { measureAsync } from "@/lib/perf";
import { unstable_cache } from "next/cache";

const getCachedFundSchemes = unstable_cache(
  async (tenantId: string, userId: string, role: string) =>
    measureAsync("layout.fund.schemes", async () => {
      const groups = await prisma.group.findMany({
        where: {
          tenantId,
          fundingMode: "SELF_FUNDED",
          ...(role === "SUPER_ADMIN"
            ? {}
            : { fundAdministrators: { some: { id: userId } } }),
        },
        select: {
          id: true,
          name: true,
          selfFundedAccount: { select: { balance: true, minimumBalance: true } },
        },
        orderBy: { name: "asc" },
      });

      return groups.map(g => ({
        id: g.id,
        name: g.name,
        balance: Number(g.selfFundedAccount?.balance ?? 0),
        isLow: g.selfFundedAccount
          ? Number(g.selfFundedAccount.balance) < Number(g.selfFundedAccount.minimumBalance)
          : false,
      }));
    }),
  ["fund-layout-schemes"],
  { revalidate: 60 }
);

export default async function FundLayout({ children }: { children: React.ReactNode }) {
  return measureAsync("layout.fund", async () => {
    const session = await requireRole(ROLES.FUND);
    const schemes = await getCachedFundSchemes(
      session.user.tenantId,
      session.user.id,
      session.user.role as string
    );

    return (
      <div className="flex min-h-screen bg-[#F8F9FA]">
        <FundSidebar schemes={schemes} userRole={session.user.role as string} />
        <div className="flex-1 ml-64 p-8">
          {children}
        </div>
      </div>
    );
  });
}
