import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AnalyticsService } from "@/server/services/analytics.service";
import { pdfService } from "@/server/services/pdf.service";
import { renderBoardPackHtml } from "@/server/templates/pdf/board-pack.template";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const year  = Number(searchParams.get("year")  ?? new Date().getFullYear());

  if (!month || !year || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid month or year" }, { status: 400 });
  }

  try {
    const tenantId = session.user.tenantId;

    const [packData, tenant] = await Promise.all([
      AnalyticsService.getBoardPackData(tenantId, month, year),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    ]);

    const html = renderBoardPackHtml({ ...packData, tenantName: tenant?.name ?? "Medvex" });
    const pdf  = await pdfService.renderToPdf(html, { format: "A4" });

    const filename = `board-pack-${packData.period}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control":       "private, no-cache",
      },
    });
  } catch (err) {
    console.error("[board-pack] Error generating PDF:", err);
    return NextResponse.json({ error: "Failed to generate board pack" }, { status: 500 });
  }
}
