"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type ComplaintSubmitResult = {
  success: boolean;
  error?: string;
  reference?: string;
};

export async function submitComplaintAction(
  _prev: ComplaintSubmitResult | null,
  formData: FormData
): Promise<ComplaintSubmitResult> {
  const session = await requireRole(ROLES.MEMBER);

  const subject     = (formData.get("subject")     as string)?.trim();
  const type        = (formData.get("type")         as string)?.trim();
  const description = (formData.get("description")  as string)?.trim();

  if (!subject || !type || !description) {
    return { success: false, error: "Please fill in all fields." };
  }

  const tenant = await prisma.tenant.findFirst({ select: { id: true } });
  if (!tenant) return { success: false, error: "Configuration error." };

  const complaint = await prisma.complaint.create({
    data: {
      tenantId:    tenant.id,
      memberId:    session.user.memberId ?? null,
      subject,
      type,
      description,
      status:      "OPEN",
    },
  });

  await writeAudit({
    userId:      session.user.id,
    action:      "COMPLAINT_SUBMITTED",
    module:      "MEMBER_PORTAL",
    description: `Member submitted complaint: "${subject}" (${type})`,
    metadata:    { complaintId: complaint.id },
  });

  revalidatePath("/member/support");
  return { success: true, reference: complaint.id.slice(-8).toUpperCase() };
}
