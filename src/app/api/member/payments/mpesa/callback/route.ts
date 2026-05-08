import { MemberPaymentService } from "@/server/services/member-payment.service";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const callbackSchema = z.object({
  checkoutRequestId: z.string().min(1),
  merchantRequestId: z.string().optional(),
  resultCode: z.union([z.string(), z.number()]),
  resultDescription: z.string().min(1),
  mpesaReceipt: z.string().optional(),
  amount: z.number().positive().optional(),
  phoneNumber: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const bodyText = await request.text();
  const signature = request.headers.get("x-aicare-signature");

  if (!MemberPaymentService.verifyCallbackSignature(bodyText, signature)) {
    return NextResponse.json({ error: "Invalid callback signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid callback payload" }, { status: 400 });
  }

  try {
    const payment = await MemberPaymentService.applyMpesaCallback(parsed.data);
    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      status: payment.status,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}
