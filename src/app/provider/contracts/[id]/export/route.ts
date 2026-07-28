import { NextResponse, type NextRequest } from "next/server";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { ProviderContractViewService } from "@/server/services/provider-contract-view/service";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * PNOS F7.3 — provider contract rate-schedule CSV export endpoint.
 *
 * Thin adapter over ProviderContractViewService.exportRatesCsv (which requires
 * provider.contract.read + provider scope and pages the effective rates to
 * exhaustion — no omitted rows — with a watermark + checksum). Gated behind
 * `providerContractView` (§11.1) like the F7.3 pages, so it is dark until the
 * F7.1 §10 sign-off. Errors map to safe statuses (forbidden→403, absent/
 * cross-provider→404). The egress is audited with the row count / checksum.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await ProviderAccessService.resolveUserContext();

  if (!(await ProviderAccessSettingsService.isContractViewEnabled(ctx.tenantId, ctx.providerId))) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Optional service-date (mirrors the detail page's search); defaults to now.
  const dateParam = req.nextUrl.searchParams.get("date");
  const parsed = dateParam ? new Date(dateParam) : new Date();
  const serviceDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  try {
    const result = await ProviderContractViewService.exportRatesCsv(ctx, id, { serviceDate });
    if (!result) return new NextResponse("Not found", { status: 404 }); // absent / cross-provider / hidden

    const { filename, csv, evidence } = result;
    await writeAudit({
      userId: ctx.actorId,
      action: "CONTRACT:EXPORT",
      module: "provider-contract-view",
      description: `Provider contract rate export (contract ${id})`,
      metadata: {
        contractId: id,
        providerId: ctx.providerId,
        version: evidence.version,
        rowCount: evidence.rowCount,
        contractNumber: evidence.contractNumber,
        serviceDate: serviceDate.toISOString().slice(0, 10),
        checksum: evidence.checksum,
      },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Contract-Csv-Version": evidence.version,
        "X-Contract-Row-Count": String(evidence.rowCount),
        "X-Contract-Checksum": evidence.checksum,
      },
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "FORBIDDEN_PERMISSION" || code === "FORBIDDEN_BRANCH") {
      return new NextResponse("Forbidden", { status: 403 });
    }
    return new NextResponse("Not found", { status: 404 });
  }
}
