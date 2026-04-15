"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import type { ServiceRequestCategory, ServiceRequestPriority } from "@prisma/client";

export async function submitServiceRequestAction(formData: FormData) {
  const session = await requireRole(ROLES.HR);

  if (!session.user.groupId) {
    throw new Error("No primary group associated with this HR user.");
  }

  const subject = formData.get("subject") as string;
  const category = formData.get("category") as ServiceRequestCategory;
  const priority = formData.get("priority") as ServiceRequestPriority;
  const body = formData.get("body") as string;

  const sr = await prisma.serviceRequest.create({
    data: {
      tenantId: session.user.tenantId,
      groupId: session.user.groupId,
      submittedById: session.user.id,
      subject,
      category,
      priority,
      body,
      status: "OPEN",
    }
  });

  await writeAudit({
    userId: session.user.id,
    action: "SUPPORT_TICKET_CREATED",
    module: "SUPPORT",
    description: `Service Request submitted: ${subject}`,
    metadata: { requestId: sr.id, category, priority }
  });

  redirect("/hr/support");
}
