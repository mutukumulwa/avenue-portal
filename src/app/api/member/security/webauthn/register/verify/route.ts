import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { auth } from "@/lib/auth";
import { WebAuthnEnrollmentService } from "@/server/services/secure-checkin/webauthn";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MEMBER_USER" || !session.user.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      response?: RegistrationResponseJSON;
      deviceName?: string;
      approvalToken?: string;
    };

    if (!body.response) {
      return NextResponse.json({ error: "Registration response is required." }, { status: 400 });
    }

    const credential = await WebAuthnEnrollmentService.verifyRegistration({
      tenantId: session.user.tenantId,
      memberId: session.user.memberId,
      response: body.response,
      deviceName: body.deviceName,
      approvalToken: body.approvalToken,
    });

    return NextResponse.json({
      ok: true,
      credentialId: credential.id,
      deviceName: credential.deviceName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify device registration." },
      { status: 400 }
    );
  }
}
