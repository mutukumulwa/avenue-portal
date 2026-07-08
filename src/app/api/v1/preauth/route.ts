import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential } from "@/lib/apiAuth";
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";

async function postPreAuth(req: Request) {
  try {
    const body = await req.json();
    const { memberNumber, providerCode, benefitCategory, diagnoses, estimatedCost, notes } = body;

    // E2E-D04: mirror the safe POST-claim behaviour. A per-facility key attributes
    // the pre-auth to its OWN provider — providerCode from the body is only a
    // consistency check and can never override the key. The operator key still
    // resolves the provider from providerCode.
    const credential = await getApiCredential(req);
    const providerFromKey = credential?.kind === "provider" ? credential.providerId : null;

    if (!memberNumber || (!providerCode && !providerFromKey) || !benefitCategory || !estimatedCost || !diagnoses) {
      return NextResponse.json({ error: "Missing required clinical parameters" }, { status: 400 });
    }

    // Resolve provider from the key when present; otherwise (operator) from body.
    const provider = providerFromKey
      ? await prisma.provider.findFirst({ where: { id: providerFromKey } })
      : await prisma.provider.findFirst({ where: { slade360ProviderId: providerCode } });

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // A provider key cannot spoof providerCode to another facility.
    if (providerFromKey && providerCode && provider.slade360ProviderId && providerCode !== provider.slade360ProviderId) {
      return NextResponse.json({ error: "Provider code does not match the authenticated facility" }, { status: 403 });
    }

    // Confine member lookup to the provider's contracted clients/groups for a
    // facility key (deny-by-default entitlement). Out-of-scope members return the
    // same 404 as a missing member — no PII leaked. Operator key spans the tenant.
    const scope = providerFromKey
      ? await ProviderEntitlementService.entitledMemberWhere(providerFromKey)
      : {};

    const member = await prisma.member.findFirst({
      where: { memberNumber, ...scope },
      select: { id: true, tenantId: true, status: true }
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // A facility key can only pre-authorize for its own tenant's members.
    if (provider.tenantId !== member.tenantId) {
      return NextResponse.json({ error: "Provider and member belong to different tenants" }, { status: 403 });
    }

    if (member.status !== "ACTIVE") {
      return NextResponse.json({ error: "Member is not active" }, { status: 403 });
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
