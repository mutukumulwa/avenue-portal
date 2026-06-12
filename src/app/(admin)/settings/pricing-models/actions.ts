"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function createPricingModelAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  let errorMsg = "";
  let newModelId = "";

  try {
    const name = formData.get("name") as string;
    const type = formData.get("type") as string;
    const description = formData.get("description") as string;

    if (!name || !type) {
      throw new Error("Name and type are required");
    }

    const model = await prisma.pricingModel.create({
      data: {
        tenantId: session.user.tenantId,
        name,
        type,
        description,
        parameters: {},
        isActive: true,
      },
    });
    newModelId = model.id;
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to create model";
  }

  if (errorMsg) {
    redirect(`/settings/pricing-models?error=${encodeURIComponent(errorMsg)}`);
  }

  redirect(`/settings/pricing-models/${newModelId}`);
}
