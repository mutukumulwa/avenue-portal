import { requireRole, ROLES } from "@/lib/rbac";
import { AnalyticsService } from "@/server/services/analytics.service";
import { pdfService } from "@/server/services/pdf.service";
import { renderBoardPackHtml } from "@/server/templates/pdf/board-pack.template";
import { prisma } from "@/lib/prisma";
import { ArrowLeft, FileText, Download } from "lucide-react";
import Link from "next/link";

/**
 * Board Pack page — Process 14 §14 spec
 * Allows senior users to generate and download the monthly board pack PDF.
 * Archives each generated pack to ActivityLog for audit.
 */

async function generateBoardPackAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const session = await requireRole(ROLES.UNDERWRITING);
  const month   = Number(formData.get("month"));
  const year    = Number(formData.get("year"));

  const tenantId = session.user.tenantId;

  const [packData, tenant] = await Promise.all([
    AnalyticsService.getBoardPackData(tenantId, month, year),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  const html = renderBoardPackHtml({ ...packData, tenantName: tenant?.name ?? "Medvex" });
  const pdf  = await pdfService.renderToPdf(html, { format: "A4" });

  // Log the generation to ActivityLog
  await prisma.activityLog.create({
    data: {
      entityType:  "SYSTEM",
      entityId:    tenantId,
      action:      "BOARD_PACK_GENERATED",
      description: `Monthly board pack generated for ${packData.period} by ${session.user.id}`,
      userId:      session.user.id,
      metadata:    {
        period:       packData.period,
        schemeCount:  packData.schemeGrid.length,
        generatedAt:  packData.generatedAt,
      } as never,
    },
  });

  // Return a redirect to the PDF download API
  const { redirect } = await import("next/navigation");
  redirect(`/api/analytics/board-pack?month=${month}&year=${year}`);
}

export default async function BoardPackPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const now     = new Date();
  const { month: mParam, year: yParam } = await searchParams;
  const selectedMonth = mParam ? Number(mParam) : now.getMonth() + 1;
  const selectedYear  = yParam ? Number(yParam) : now.getFullYear();

  // Fetch recent board pack generation history from ActivityLog
  const history = await prisma.activityLog.findMany({
    where: {
      entityType: "SYSTEM",
      entityId:   session.user.tenantId,
      action:     "BOARD_PACK_GENERATED",
    },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, description: true, createdAt: true, metadata: true },
  });

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString("en-KE", { month: "long" }),
  }));

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/analytics" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading flex items-center gap-2">
            <FileText size={20} className="text-avenue-indigo" />
            Monthly Board Pack
          </h1>
          <p className="text-avenue-text-muted text-sm mt-0.5">
            Generate the board-ready monthly management report — portfolio MLR, scheme grid, top drivers, provider performance, compliance metrics.
          </p>
        </div>
      </div>

      {/* Generate form */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-avenue-text-heading text-sm">Generate Board Pack</h2>
        <form action={generateBoardPackAction} className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Month</label>
            <select name="month" defaultValue={selectedMonth}
              className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-avenue-indigo focus:outline-none">
              {months.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Year</label>
            <select name="year" defaultValue={selectedYear}
              className="border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-avenue-indigo focus:outline-none">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button type="submit"
            className="bg-avenue-indigo text-white px-6 py-2 rounded-full text-sm font-semibold hover:bg-avenue-secondary transition-colors flex items-center gap-2">
            <Download size={14} /> Generate PDF
          </button>
        </form>
        <p className="text-xs text-avenue-text-muted">
          The PDF is rendered server-side using Puppeteer and includes Medvex&apos;s brand identity. Generation takes approximately 3–5 seconds.
        </p>
      </div>

      {/* Preview link for current month */}
      <div className="bg-[#F8F9FF] border border-avenue-indigo/20 rounded-[8px] p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-avenue-text-heading">Quick download — current month</p>
          <p className="text-xs text-avenue-text-muted mt-0.5">
            {months[now.getMonth()].label} {now.getFullYear()}
          </p>
        </div>
        <a href={`/api/analytics/board-pack?month=${now.getMonth() + 1}&year=${now.getFullYear()}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-avenue-indigo text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-avenue-secondary transition-colors">
          <Download size={12} /> Download PDF
        </a>
      </div>

      {/* Generation history */}
      {history.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#EEEEEE]">
            <h2 className="font-semibold text-avenue-text-heading text-sm">Generation History</h2>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {history.map((h) => {
              const meta = h.metadata as Record<string, unknown> | null;
              return (
                <div key={h.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-avenue-text-heading">
                      {meta?.period ? String(meta.period) : "—"}
                    </p>
                    <p className="text-xs text-avenue-text-muted mt-0.5">
                      {new Date(h.createdAt).toLocaleString("en-KE")} ·{" "}
                      {meta?.schemeCount ? `${String(meta.schemeCount)} schemes` : ""}
                    </p>
                  </div>
                  {!!meta?.period && (
                    <a href={`/api/analytics/board-pack?month=${String(meta.period).split("-")[1]}&year=${String(meta.period).split("-")[0]}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-avenue-indigo font-semibold hover:underline flex items-center gap-1">
                      <Download size={11} /> Re-download
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
