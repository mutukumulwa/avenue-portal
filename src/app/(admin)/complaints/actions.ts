"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function updateComplaintStatusAction(
  complaintId: string,
  status: "INVESTIGATING" | "RESOLVED" | "DISMISSED",
  resolution?: string
) {
  const session = await requireRole(ROLES.OPS);

  await prisma.complaint.update({
    where: { id: complaintId },
    data: {
      status,
      ...(resolution ? { resolution } : {}),
      ...(status === "RESOLVED" || status === "DISMISSED" ? { resolvedAt: new Date() } : {}),
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "COMPLAINT_STATUS_UPDATED",
    module: "COMPLAINTS",
    description: `Complaint ${complaintId} moved to ${status}.`,
    metadata: { complaintId, status },
  });

  revalidatePath("/complaints");
}
