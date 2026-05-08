import { UssdService } from "@/server/services/ussd.service";
import { NextRequest, NextResponse } from "next/server";

async function readPayload(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await request.json() as Record<string, string>;
  }
  const formData = await request.formData();
  return Object.fromEntries(formData.entries()) as Record<string, string>;
}

export async function POST(request: NextRequest) {
  const payload = await readPayload(request);
  const response = await UssdService.handle({
    phoneNumber: payload.phoneNumber ?? payload.msisdn ?? payload.phone ?? "",
    text: payload.text ?? "",
    tenantSlug: payload.tenantSlug,
  });

  return new NextResponse(response, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(request: NextRequest) {
  const response = await UssdService.handle({
    phoneNumber: request.nextUrl.searchParams.get("phoneNumber") ?? request.nextUrl.searchParams.get("msisdn") ?? "",
    text: request.nextUrl.searchParams.get("text") ?? "",
    tenantSlug: request.nextUrl.searchParams.get("tenantSlug") ?? undefined,
  });

  return new NextResponse(response, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
