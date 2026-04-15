"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";

export async function resolveServiceRequestAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const requestId = formData.get("requestId") as string;
  const response = formData.get("response") as string;

  const req = await prisma.serviceRequest.update({
    where: { id: requestId, tenantId: session.user.tenantId },
    data: {
      status: "RESOLVED",
      response,
      respondedAt: new Date(),
      respondedById: session.user.id,
    }
  });

  await writeAudit({
    userId: session.user.id,
    action: "SUPPORT_TICKET_RESOLVED",
    module: "SUPPORT",
    description: `Resolved Service Request: ${req.subject}`,
    metadata: { requestId }
  });

  revalidatePath("/service-requests");
  revalidatePath(`/service-requests/${requestId}`);
}
