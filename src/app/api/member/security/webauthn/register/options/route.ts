import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WebAuthnEnrollmentService } from "@/server/services/secure-checkin/webauthn";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MEMBER_USER" || !session.user.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({})) as { approvalToken?: string };
    const options = await WebAuthnEnrollmentService.beginRegistration({
      tenantId: session.user.tenantId,
      memberId: session.user.memberId,
      approvalToken: body.approvalToken,
    });
    return NextResponse.json(options);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start device registration." },
      { status: 400 }
    );
  }
}
