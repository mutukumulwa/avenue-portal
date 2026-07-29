import { NextResponse, type NextRequest } from "next/server";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderDocumentService } from "@/server/services/provider-document.service";
import { minioDocumentPort } from "@/lib/document-storage";

export const dynamic = "force-dynamic";

/**
 * F2.6 proof consumer — the provider document download endpoint. Resolves the
 * canonical access context, authorizes the download against the document's own
 * target (reauthorize + CLEAN gate), and 302-redirects to a minute-scale signed
 * URL. Errors map to safe statuses: forbidden→403, everything else (absent,
 * cross-provider, pending/quarantined)→404 so existence/scan-state never leaks.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await ProviderAccessService.resolveUserContext();
  try {
    const { url } = await ProviderDocumentService.authorizeDownload(ctx, { documentId: id }, minioDocumentPort);
    return NextResponse.redirect(url);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "FORBIDDEN_PERMISSION" || code === "FORBIDDEN_BRANCH") {
      return new NextResponse("Forbidden", { status: 403 });
    }
    // NOT_FOUND / DOCUMENT_NOT_AVAILABLE / anything else → safe 404
    return new NextResponse("Not found", { status: 404 });
  }
}
