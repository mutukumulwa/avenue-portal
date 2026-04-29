import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { auth } from "@/lib/auth";
import { WebAuthnCheckInService } from "@/server/services/secure-checkin/webauthn";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MEMBER_USER" || !session.user.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      challengeId?: string;
      response?: AuthenticationResponseJSON;
    };
    if (!body.challengeId || !body.response) {
      return NextResponse.json({ error: "Check-in request and biometric response are required." }, { status: 400 });
    }

    const result = await WebAuthnCheckInService.verifyAssertion({
      tenantId: session.user.tenantId,
      memberId: session.user.memberId,
      challengeId: body.challengeId,
      response: body.response,
    });

    return NextResponse.json({
      ok: true,
      visitCode: result.visitCode,
      providerName: result.providerName,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify biometric check-in." },
      { status: 400 }
    );
  }
}
