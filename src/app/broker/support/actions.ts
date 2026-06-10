"use server";

import { auth } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import type { ServiceRequestCategory, ServiceRequestPriority } from "@prisma/client";
import { redirect } from "next/navigation";

export async function submitBrokerSupportAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "BROKER_USER") redirect("/unauthorized");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });
  if (!user?.brokerId) redirect("/broker/support?error=no-broker");

  const groupId = formData.get("groupId") as string;
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const category = (formData.get("category") as ServiceRequestCategory) || "GENERAL";
  const priority = (formData.get("priority") as ServiceRequestPriority) || "NORMAL";

  if (!groupId || !subject || !body) {
    redirect("/broker/support?error=missing-fields");
  }

  const group = await prisma.group.findFirst({
    where: { id: groupId, tenantId: session.user.tenantId, brokerId: user.brokerId },
    select: { id: true, name: true },
  });
  if (!group) redirect("/broker/support?error=invalid-group");

  const request = await prisma.serviceRequest.create({
    data: {
      tenantId: session.user.tenantId,
      groupId: group.id,
      submittedById: session.user.id,
      subject,
      category,
      priority,
      body,
      status: "OPEN",
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_SUPPORT_TICKET_CREATED",
    module: "SUPPORT",
    description: `Broker support request submitted for ${group.name}: ${subject}`,
    metadata: { requestId: request.id, groupId: group.id, category, priority },
  });

  redirect("/broker/support?submitted=1");
}
