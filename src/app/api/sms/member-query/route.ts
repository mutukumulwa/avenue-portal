import { SmsQueryService } from "@/server/services/sms-query.service";
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
  const response = await SmsQueryService.handle({
    phoneNumber: payload.phoneNumber ?? payload.msisdn ?? payload.from ?? payload.phone ?? "",
    message: payload.message ?? payload.text ?? payload.body ?? "",
    tenantSlug: payload.tenantSlug,
  });

  return NextResponse.json({ message: response });
}

export async function GET(request: NextRequest) {
  const response = await SmsQueryService.handle({
    phoneNumber: request.nextUrl.searchParams.get("phoneNumber") ?? request.nextUrl.searchParams.get("msisdn") ?? "",
    message: request.nextUrl.searchParams.get("message") ?? request.nextUrl.searchParams.get("text") ?? "",
    tenantSlug: request.nextUrl.searchParams.get("tenantSlug") ?? undefined,
  });

  return NextResponse.json({ message: response });
}
