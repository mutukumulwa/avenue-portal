import { NextResponse, type NextRequest } from "next/server";
import { requireRole, ROLES } from "@/lib/rbac";
import { NetworkPerformanceService, NETWORK_ANALYTICS_PERMISSION, NetworkAnalyticsError } from "@/server/services/provider-performance/network.service";

export const dynamic = "force-dynamic";

/**
 * PNOS F8.6 — network performance CSV export. Requires the explicit network-analytics
 * permission (beyond the operator role); the egress is audited inside the service
 * (NETWORK_ANALYTICS:EXPORT). No clinical detail — aggregate scores + provider names.
 */
export async function GET(req: NextRequest) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const permissions = (session.user.permissions ?? []) as string[];
  const metric = req.nextUrl.searchParams.get("metric");
  const period = req.nextUrl.searchParams.get("period");
  if (!metric || !period) return new NextResponse("Bad request", { status: 400 });

  try {
    const { filename, csv } = await NetworkPerformanceService.exportComparisonCsv(
      { userId: session.user.id, tenantId: session.user.tenantId, permissions },
      { metricKey: metric, period },
    );
    return new NextResponse(csv, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof NetworkAnalyticsError) return new NextResponse("Forbidden", { status: 403 });
    throw e;
  }
}
