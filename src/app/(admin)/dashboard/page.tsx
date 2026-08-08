import { requireRole, ROLES, type UserRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Users, Building2, Receipt, FileText, TrendingUp, Clock } from "lucide-react";
import { ClaimsTrendChart, PremiumVsClaimsChart, LossRatioGauge } from "@/components/dashboard/DashboardCharts";
import { measureAsync } from "@/lib/perf";

type MonthlyClaimRow = { month: string; claims: bigint };
type MonthlyMoneyRow = { month: string; claims: bigint; billed: number; approved: number };
type LRRow = { billed: number; approved: number };

/**
 * DEF-003 (S1): the dashboard used to admit every ANY_STAFF role and then run
 * tenant-wide claims queries unconditionally, rendering claimant name, provider,
 * claim number, billed amount and status to roles with no claim-read authority
 * (CUSTOMER_SERVICE, REPORTS_VIEWER, FUND_ADMINISTRATOR).
 *
 * The fix gates the QUERIES, not the components. A role without claim-read
 * authority never causes a claims row to be fetched, so nothing sensitive can
 * reach the RSC payload for it to be "hidden" client-side.
 */
export default async function DashboardPage() {
  const session = await requireRole(ROLES.ANY_STAFF);

  const tenantId = session.user.tenantId;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const role = session.user.role as UserRole;
  const can = (allowed: UserRole[]) => allowed.includes(role);

  // Authority to see individual claims and claim volumes.
  const canClaims = can(ROLES.CLAIMS_READ);
  // Authority to see portfolio money aggregates (loss ratio, billed/approved).
  const canMoney = can(ROLES.MONEY_READ);
  const canPreauth = can(ROLES.CLINICAL);
  const canInvoices = can(ROLES.FINANCE);
  const canMembership = can(ROLES.MEMBER_OPS);

  const [membershipRaw, claimCountsRaw, preauthRaw, invoiceRaw, monthlyClaimsRaw, monthlyMoneyRaw, lrRaw, recentActivity] =
    await measureAsync("dashboard.admin.data", () =>
      Promise.all([
        canMembership
          ? prisma.$queryRaw<{ activeMembers: number; activeGroups: number }[]>`
              SELECT
                (SELECT COUNT(*)::int FROM "Member" WHERE "tenantId" = ${tenantId} AND status = 'ACTIVE') AS "activeMembers",
                (SELECT COUNT(*)::int FROM "Group"  WHERE "tenantId" = ${tenantId} AND status = 'ACTIVE') AS "activeGroups"
            `
          : Promise.resolve([]),

        canClaims
          ? prisma.$queryRaw<{ pendingClaims: number; recentClaims: number }[]>`
              SELECT
                (SELECT COUNT(*)::int FROM "Claim" WHERE "tenantId" = ${tenantId} AND status IN ('RECEIVED','UNDER_REVIEW')) AS "pendingClaims",
                (SELECT COUNT(*)::int FROM "Claim" WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${thirtyDaysAgo}) AS "recentClaims"
            `
          : Promise.resolve([]),

        canPreauth
          ? prisma.$queryRaw<{ pendingPreauths: number }[]>`
              SELECT COUNT(*)::int AS "pendingPreauths"
              FROM "PreAuthorization"
              WHERE "tenantId" = ${tenantId} AND status IN ('SUBMITTED','UNDER_REVIEW')
            `
          : Promise.resolve([]),

        canInvoices
          ? prisma.$queryRaw<{ overdueInvoices: number }[]>`
              SELECT COUNT(*)::int AS "overdueInvoices"
              FROM "Invoice"
              WHERE "tenantId" = ${tenantId} AND status = 'OVERDUE'
            `
          : Promise.resolve([]),

        canClaims
          ? prisma.$queryRaw<MonthlyClaimRow[]>`
              SELECT
                TO_CHAR(DATE_TRUNC('month', c."createdAt"), 'Mon YY') AS month,
                COUNT(*)::int                                         AS claims
              FROM "Claim" c
              WHERE c."tenantId" = ${tenantId}
                AND c."createdAt" >= NOW() - INTERVAL '12 months'
              GROUP BY DATE_TRUNC('month', c."createdAt")
              ORDER BY DATE_TRUNC('month', c."createdAt")
            `
          : Promise.resolve([]),

        canMoney
          ? prisma.$queryRaw<MonthlyMoneyRow[]>`
              SELECT
                TO_CHAR(DATE_TRUNC('month', c."createdAt"), 'Mon YY') AS month,
                COUNT(*)::int                                        AS claims,
                COALESCE(SUM(c."billedAmount")::float,   0)          AS billed,
                COALESCE(SUM(c."approvedAmount")::float, 0)          AS approved
              FROM "Claim" c
              WHERE c."tenantId" = ${tenantId}
                AND c."createdAt" >= NOW() - INTERVAL '12 months'
              GROUP BY DATE_TRUNC('month', c."createdAt")
              ORDER BY DATE_TRUNC('month', c."createdAt")
            `
          : Promise.resolve([]),

        canMoney
          ? prisma.$queryRaw<LRRow[]>`
              SELECT
                COALESCE(SUM("billedAmount")::float,   0) AS billed,
                COALESCE(SUM("approvedAmount")::float, 0) AS approved
              FROM "Claim"
              WHERE "tenantId" = ${tenantId}
            `
          : Promise.resolve([]),

        canClaims
          ? prisma.$queryRaw<{
              id: string; claimNumber: string; firstName: string; lastName: string;
              providerName: string; billedAmount: number; status: string;
            }[]>`
              SELECT c.id, c."claimNumber", m."firstName", m."lastName",
                     p.name AS "providerName", c."billedAmount"::float AS "billedAmount", c.status
              FROM "Claim" c
              JOIN "Member" m ON c."memberId" = m.id
              JOIN "Provider" p ON c."providerId" = p.id
              WHERE c."tenantId" = ${tenantId}
              ORDER BY c."createdAt" DESC
              LIMIT 6
            `
          : Promise.resolve([]),
      ])
    );

  const activeMembers = Number(membershipRaw[0]?.activeMembers ?? 0);
  const activeGroups = Number(membershipRaw[0]?.activeGroups ?? 0);
  const pendingClaims = Number(claimCountsRaw[0]?.pendingClaims ?? 0);
  const recentClaims = Number(claimCountsRaw[0]?.recentClaims ?? 0);
  const overdueInvoices = Number(invoiceRaw[0]?.overdueInvoices ?? 0);
  const pendingPreauths = Number(preauthRaw[0]?.pendingPreauths ?? 0);

  // Chart series are assembled per authority: claim volumes need CLAIMS_READ,
  // billed/approved money needs MONEY_READ. A role holding one but not the
  // other never receives the other's numbers.
  const claimsByMonth = monthlyClaimsRaw.map(r => ({ month: r.month, claims: Number(r.claims) }));
  const moneyByMonth = monthlyMoneyRaw.map(r => ({
    month: r.month, claims: Number(r.claims), billed: Number(r.billed), approved: Number(r.approved),
  }));
  const claimsTrendData = claimsByMonth.map(r => ({ ...r, billed: 0, approved: 0 }));

  const totalBilled = Number(lrRaw[0]?.billed ?? 0);
  const totalApproved = Number(lrRaw[0]?.approved ?? 0);
  const lossRatio = totalBilled > 0 ? totalApproved / totalBilled : 0;

  // PR-028: every card/action mirrors the target page's own requireRole guard —
  // the dashboard must never offer a link its user would bounce off.
  const cards = [
    { label: "Total Active Members", value: activeMembers.toLocaleString(), sub: "Enrolled & active", icon: Users, color: "text-brand-indigo", href: "/members", allowed: ROLES.MEMBER_OPS },
    { label: "Active Corporate Groups", value: activeGroups.toLocaleString(), sub: "Policy groups", icon: Building2, color: "text-[#28A745]", href: "/groups", allowed: ROLES.MEMBER_OPS },
    { label: "Pending Claims", value: pendingClaims.toLocaleString(), sub: "Requires adjudication", icon: Receipt, color: "text-[#DC3545]", href: "/claims", allowed: ROLES.CLAIMS_READ },
    { label: "Pending Pre-Auths", value: pendingPreauths.toLocaleString(), sub: "Awaiting approval", icon: FileText, color: "text-[#17A2B8]", href: "/preauth", allowed: ROLES.CLINICAL },
    { label: "Claims This Month", value: recentClaims.toLocaleString(), sub: "Last 30 days", icon: TrendingUp, color: "text-brand-indigo", href: "/claims", allowed: ROLES.CLAIMS_READ },
    { label: "Overdue Invoices", value: overdueInvoices.toLocaleString(), sub: "Payment overdue", icon: Clock, color: "text-[#FFC107]", href: "/billing", allowed: ROLES.FINANCE },
  ].filter((c) => can(c.allowed));

  const quickActions = [
    { label: "New Claim", href: "/claims/new", bg: "bg-brand-indigo", allowed: ROLES.CLAIMS_OPS },
    { label: "New Pre-Auth", href: "/preauth/new", bg: "bg-[#17A2B8]", allowed: ROLES.CLINICAL },
    { label: "Enrol Member", href: "/members/new", bg: "bg-[#28A745]", allowed: ROLES.MEMBER_OPS },
    { label: "New Endorsement", href: "/endorsements/new", bg: "bg-[#6C757D]", allowed: ROLES.MEMBER_OPS },
    { label: "New Quotation", href: "/quotations/calculator", bg: "bg-brand-secondary", allowed: ROLES.UNDERWRITING },
    { label: "View Reports", href: "/reports", bg: "bg-[#FFC107]", allowed: ROLES.ANY_STAFF },
  ].filter(a => can(a.allowed));

  const showChartsRow = canMoney || canClaims;

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold font-heading text-brand-text-heading">Dashboard Overview</h1>
        <p className="text-brand-text-muted">Welcome back to the Medvex platform. Here is what is happening today.</p>
      </div>

      {cards.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <Link key={card.label} href={card.href} className="block">
                <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm hover:shadow-md hover:border-brand-indigo/30 transition-all font-ui">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-brand-text-muted">{card.label}</p>
                    <Icon size={16} className={card.color} />
                  </div>
                  <p className={`text-2xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-brand-text-muted mt-1">{card.sub}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Charts row — money aggregates require MONEY_READ, claim volumes CLAIMS_READ */}
      {showChartsRow && (
        <div className="grid gap-4 lg:grid-cols-3">
          {canMoney && (
            <div className="lg:col-span-1">
              <LossRatioGauge lossRatio={lossRatio} />
            </div>
          )}
          {canClaims && (
            <div className={canMoney ? "lg:col-span-2" : "lg:col-span-3"}>
              <ClaimsTrendChart data={claimsTrendData} />
            </div>
          )}
        </div>
      )}

      {canMoney && <PremiumVsClaimsChart data={moneyByMonth} />}

      <div className={`grid gap-4 ${canClaims ? "lg:grid-cols-7" : "lg:grid-cols-3"}`}>
        {/* Quick actions */}
        {quickActions.length > 0 && (
          <div className="lg:col-span-3 bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE]">
              <h2 className="font-bold text-brand-text-heading font-heading">Quick Actions</h2>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {quickActions.map(a => (
                <Link key={a.label} href={a.href}
                  className={`${a.bg} text-white text-xs font-bold py-2.5 px-3 rounded-full text-center hover:opacity-90 transition-opacity`}>
                  {a.label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent claims — never fetched, and never rendered, without CLAIMS_READ */}
        {canClaims && (
          <div className="lg:col-span-4 bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
              <h2 className="font-bold text-brand-text-heading font-heading">Recent Claims</h2>
              <Link href="/claims" className="text-brand-indigo text-xs font-semibold hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-[#EEEEEE]">
              {recentActivity.length === 0 && (
                <p className="px-5 py-6 text-sm text-brand-text-body text-center">No claims yet.</p>
              )}
              {recentActivity.map(c => (
                <Link key={c.id} href={`/claims/${c.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[#F8F9FA] transition-colors">
                  <div>
                    <p className="text-xs font-bold font-mono text-brand-text-heading">{c.claimNumber}</p>
                    <p className="text-xs text-brand-text-muted">{c.firstName} {c.lastName} · {c.providerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-brand-text-heading">UGX {Number(c.billedAmount).toLocaleString()}</p>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      c.status === "APPROVED" || c.status === "PAID" ? "bg-[#28A745]/10 text-[#28A745]" :
                      c.status === "DECLINED" ? "bg-[#DC3545]/10 text-[#DC3545]" :
                      "bg-[#17A2B8]/10 text-[#17A2B8]"
                    }`}>{c.status.replace(/_/g, " ")}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {cards.length === 0 && quickActions.length === 0 && !showChartsRow && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-8 text-center">
          <p className="text-sm text-brand-text-body">
            Your role does not have dashboard widgets assigned. Use the navigation to reach your work areas.
          </p>
        </div>
      )}
    </div>
  );
}
