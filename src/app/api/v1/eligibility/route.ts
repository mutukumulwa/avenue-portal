import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiKey, getApiCredential, operatorTenantWhere } from "@/lib/apiAuth";
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";

async function getEligibility(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const memberNumber = searchParams.get("memberNumber");

    if (!memberNumber) {
      return NextResponse.json({ error: "Missing memberNumber parameter" }, { status: 400 });
    }

    // E2E-D02: a per-facility key may only resolve members of the clients its
    // contracts cover; a member outside that entitlement returns 404. The
    // operator key is confined to its bound tenant (BD-06 / operatorTenantWhere).
    const credential = await getApiCredential(req);
    const scope =
      credential?.kind === "provider"
        ? await ProviderEntitlementService.entitledMemberWhere(credential.providerId)
        : operatorTenantWhere(credential);

    const member = await prisma.member.findFirst({
      where: { memberNumber, ...scope },
      include: {
        group: { select: { name: true, status: true, tenantId: true } },
        package: { select: { name: true } },
      }
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Determine absolute boolean eligibility
    const isEligible = member.status === "ACTIVE" && member.group.status === "ACTIVE";

    // Slade360 SMART interface shape
    const responseSchema = {
      payer: "Medvex",
      member: {
        firstName: member.firstName,
        lastName: member.lastName,
        memberNumber: member.memberNumber,
        dob: member.dateOfBirth.toISOString().split("T")[0],
        gender: member.gender,
        relationship: member.relationship,
      },
      policy: {
        groupName: member.group.name,
        packageName: member.package.name,
        status: member.status,
        isEligible,
      }
    };

    return NextResponse.json(responseSchema, { status: 200 });

  } catch (error) {
    console.error("Eligibility API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export const GET = withApiKey(getEligibility);
