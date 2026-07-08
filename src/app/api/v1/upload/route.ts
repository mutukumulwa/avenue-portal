import { NextResponse } from "next/server";
import { uploadFile } from "@/lib/minio";
import { withApiKey } from "@/lib/apiAuth";

/**
 * POST /api/v1/upload — authenticated file drop for the B2B API (e.g. document
 * uploads from a facility HMS).
 *
 * BD-06: auth goes through the shared withApiKey gate — the same operator /
 * per-facility key channel as the rest of /api/v1 — instead of a bespoke
 * substring check against an env var OR-ed with an in-source default string.
 * That removes the default secret AND the weak substring match, and fails
 * closed when API_KEY is unset.
 */
async function postUpload(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileUrl = await uploadFile(buffer, file.name, file.type);

    return NextResponse.json({ url: fileUrl }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const POST = withApiKey(postUpload);
