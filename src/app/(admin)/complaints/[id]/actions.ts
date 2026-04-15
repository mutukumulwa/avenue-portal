"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function moveToInvestigatingAction(complaintId: string) {
  const session = await requireRole(ROLES.OPS);

  await prisma.complaint.update({
    where: { id: complaintId },
    data:  { status: "INVESTIGATING" },
  });

  await writeAudit({
    userId: session.user.id, action: "COMPLAINT_STATUS_UPDATED", module: "COMPLAINTS",
    description: `Complaint ${complaintId} moved to INVESTIGATING.`,
    metadata: { complaintId, status: "INVESTIGATING" },
  });

  revalidatePath(`/complaints/${complaintId}`);
  revalidatePath("/complaints");
}

export async function resolveComplaintAction(
  complaintId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session  = await requireRole(ROLES.OPS);
  const resolution = (formData.get("resolution") as string | null)?.trim();
  if (!resolution) return { error: "A resolution note is required." };

  await prisma.complaint.update({
    where: { id: complaintId },
    data: { status: "RESOLVED", resolution, resolvedAt: new Date() },
  });

  await writeAudit({
    userId: session.user.id, action: "COMPLAINT_RESOLVED", module: "COMPLAINTS",
    description: `Complaint ${complaintId} resolved. Resolution: ${resolution}`,
    metadata: { complaintId },
  });

  revalidatePath("/complaints");
  redirect("/complaints");
}

export async function dismissComplaintAction(
  complaintId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session  = await requireRole(ROLES.OPS);
  const resolution = (formData.get("resolution") as string | null)?.trim();
  if (!resolution) return { error: "A reason is required when dismissing." };

  await prisma.complaint.update({
    where: { id: complaintId },
    data: { status: "DISMISSED", resolution, resolvedAt: new Date() },
  });

  await writeAudit({
    userId: session.user.id, action: "COMPLAINT_DISMISSED", module: "COMPLAINTS",
    description: `Complaint ${complaintId} dismissed. Reason: ${resolution}`,
    metadata: { complaintId },
  });

  revalidatePath("/complaints");
  redirect("/complaints");
}
