import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey } from "@/lib/apiAuth";

async function postPreAuth(req: Request) {
  try {
    const body = await req.json();
    const { memberNumber, providerCode, benefitCategory, diagnoses, estimatedCost, notes } = body;

    if (!memberNumber || !providerCode || !benefitCategory || !estimatedCost || !diagnoses) {
      return NextResponse.json({ error: "Missing required clinical parameters" }, { status: 400 });
    }

    const member = await prisma.member.findFirst({
      where: { memberNumber },
      select: { id: true, tenantId: true, status: true }
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    
    if (member.status !== "ACTIVE") {
      return NextResponse.json({ error: "Member is not active" }, { status: 403 });
    }

    const provider = await prisma.provider.findFirst({
        where: { slade360ProviderId: providerCode }
    });

    if (!provider) {
        return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Auto-generate Preauth Number
    const count = await prisma.preAuthorization.count({ where: { tenantId: member.tenantId } });
    const preauthNumber = `PA-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const pa = await prisma.preAuthorization.create({
      data: {
        tenantId: member.tenantId,
        preauthNumber,
        memberId: member.id,
        providerId: provider.id,
        submittedBy: "PROVIDER",
        benefitCategory,
        diagnoses,
        procedures: [],
        estimatedCost: estimatedCost,
        status: "SUBMITTED" as const,
        clinicalNotes: notes ?? null,
      }
    });

    return NextResponse.json({
        success: true,
        reference: pa.preauthNumber,
        status: pa.status,
        message: "Pre-authorization received and queued for review."
    }, { status: 201 });

  } catch (error) {
    console.error("Preauth API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const POST = withApiKey(postPreAuth);
