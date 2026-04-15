import { NextResponse } from "next/server";
import { uploadFile } from "@/lib/minio";

// A secure API endpoint that takes FormData (e.g., from generic file drops)
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    // Secure it natively (or via our x-api-key standard from 3.4)
    if (!authHeader || !authHeader.includes(process.env.API_KEY || "av-local-secret")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
