"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import type { MemberRelationship, Gender } from "@prisma/client";
import type { ActionState } from "./types";

export async function addMemberEndorsementAction(
  _prev: ActionState,
  formData: FormData
) {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;
  const tenantId = session.user.tenantId;

  if (!groupId) return { error: "No corporate group associated with your account." };

  const firstName = (formData.get("firstName") as string).trim();
  const lastName = (formData.get("lastName") as string).trim();
  const dateOfBirth = formData.get("dateOfBirth") as string;
  const gender = formData.get("gender") as Gender;
  const relationship = formData.get("relationship") as MemberRelationship;
  const idNumber = (formData.get("idNumber") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  const effectiveDate = formData.get("effectiveDate") as string;

  if (!firstName || !lastName || !dateOfBirth || !gender || !relationship || !effectiveDate) {
    return { error: "Please fill in all required fields." };
  }

  const endorsementNumber = `REQ-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

  const endorsement = await prisma.endorsement.create({
    data: {
      tenantId,
      groupId,
      endorsementNumber,
      type: "MEMBER_ADDITION",
      status: "SUBMITTED",
      effectiveDate: new Date(effectiveDate),
      requestedBy: session.user.id,
      changeDetails: {
         firstName,
         lastName,
         dateOfBirth: new Date(dateOfBirth).toISOString(),
         gender,
         relationship,
         idNumber,
         phone,
         email
      }
    }
  });

  return { success: true, endorsementNumber: endorsement.endorsementNumber };
}
