import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential } from "@/lib/apiAuth";

async function postPreAuth(req: Request) {
  try {
    const body = await req.json();
    const { memberNumber, providerCode, benefitCategory, diagnoses, estimatedCost, notes } = body;

    // A per-facility key attributes the pre-auth to its own provider (providerCode
    // is then optional and cannot be spoofed to another facility). The operator
    // key still resolves the provider from providerCode.
    const credential = await getApiCredential(req);
    const providerFromKey = credential?.kind === "provider" ? credential.providerId : null;

    if (!memberNumber || (!providerCode && !providerFromKey) || !benefitCategory || !estimatedCost || !diagnoses) {
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

    const provider = providerFromKey
      ? await prisma.provider.findFirst({ where: { id: providerFromKey } })
      : await prisma.provider.findFirst({ where: { slade360ProviderId: providerCode } });

    if (!provider) {
        return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }
    // A facility key can only file for its own tenant's members.
    if (provider.tenantId !== member.tenantId) {
      return NextResponse.json({ error: "Provider and member belong to different tenants" }, { status: 403 });
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
