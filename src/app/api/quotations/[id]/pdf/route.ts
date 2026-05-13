import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { quotationBuilderService } from "@/server/services/quotation-builder.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const pdfBuffer = await quotationBuilderService.generatePdf(id, session.user.tenantId);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="quotation-${id}.pdf"`,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (err) {
    console.error("[quotation-pdf] Error generating PDF:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
