import { NextResponse, type NextRequest } from "next/server";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { ProviderRemittanceService } from "@/server/services/provider-remittance/service";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * PNOS F6.5 — provider remittance CSV export endpoint.
 *
 * Thin adapter over ProviderRemittanceService.exportBatchCsv (which requires
 * provider.settlement.export + provider scope and pages the read model to
 * exhaustion — no omitted rows). Gated behind providerRemittanceV2 (§11.1) like
 * the F6.4 page, so it is dark until the F6.1 §12 finance sign-off. Errors map to
 * safe statuses (forbidden→403, absent/cross-provider→404). The egress is audited
 * with the row count / totals / checksum evidence. Stop (F6.5): no PDF.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await ProviderAccessService.resolveUserContext();

  if (!(await ProviderAccessSettingsService.isRemittanceV2Enabled(ctx.tenantId, ctx.providerId))) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const { filename, csv, evidence } = await ProviderRemittanceService.exportBatchCsv(ctx, id);

    await writeAudit({
      userId: ctx.actorId,
      action: "SETTLEMENT:EXPORT",
      module: "provider-remittance",
      description: `Provider remittance CSV export (batch ${id})`,
      metadata: {
        batchId: id,
        providerId: ctx.providerId,
        version: evidence.version,
        rowCount: evidence.rowCount,
        totalApproved: evidence.totals.approved,
        totalPaid: evidence.totals.paid,
        checksum: evidence.checksum,
      },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Remittance-Csv-Version": evidence.version,
        "X-Remittance-Row-Count": String(evidence.rowCount),
        "X-Remittance-Checksum": evidence.checksum,
      },
    });
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "FORBIDDEN_PERMISSION" || code === "FORBIDDEN_BRANCH") {
      return new NextResponse("Forbidden", { status: 403 });
    }
    // NOT_FOUND / cross-provider / absent → safe 404
    return new NextResponse("Not found", { status: 404 });
  }
}
