import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WebAuthnCheckInService } from "@/server/services/secure-checkin/webauthn";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MEMBER_USER" || !session.user.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as { challengeId?: string };
    if (!body.challengeId) return NextResponse.json({ error: "Check-in request is required." }, { status: 400 });

    const options = await WebAuthnCheckInService.generateAssertionOptions({
      tenantId: session.user.tenantId,
      memberId: session.user.memberId,
      challengeId: body.challengeId,
    });

    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start biometric check-in." },
      { status: 400 }
    );
  }
}
