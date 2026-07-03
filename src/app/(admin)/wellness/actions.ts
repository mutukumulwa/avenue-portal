"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { WellnessService } from "@/server/services/wellness.service";
import type { WellnessProgramType, WellnessActivityType } from "@prisma/client";

const PATH = "/wellness";

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : "Action failed";
  if (msg === "NEXT_REDIRECT") throw err;
  redirect(`${PATH}?error=${encodeURIComponent(msg)}`);
}

export async function upsertProgramAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  try {
    const conditions = (formData.get("targetConditions") as string || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const cadenceRaw = formData.get("cadenceMonths") as string;
    const fundedRaw = formData.get("fundedAmount") as string;
    await WellnessService.upsertProgram(session.user.tenantId, {
      id: (formData.get("id") as string) || undefined,
      name: (formData.get("name") as string)?.trim(),
      type: formData.get("type") as WellnessProgramType,
      description: (formData.get("description") as string) || undefined,
      cadenceMonths: cadenceRaw ? Number(cadenceRaw) : null,
      fundedAmount: fundedRaw ? Number(fundedRaw) : null,
      currency: (formData.get("currency") as string)?.trim() || undefined,
      targetConditions: conditions,
      pointsReward: Number(formData.get("pointsReward") || 0),
    });
  } catch (err) {
    fail(err);
  }
  revalidatePath(PATH);
}

export async function retireProgramAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  await WellnessService.retireProgram(session.user.tenantId, formData.get("id") as string);
  revalidatePath(PATH);
}

export async function enrollAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  try {
    const enrollment = await WellnessService.enroll(
      session.user.tenantId,
      formData.get("programId") as string,
      formData.get("memberId") as string,
    );
    await writeAudit({
      userId: session.user.id,
      action: "WELLNESS_ENROLLED",
      module: "WELLNESS",
      description: `Enrolled member in wellness programme`,
      metadata: { enrollmentId: enrollment.id },
    });
  } catch (err) {
    fail(err);
  }
  revalidatePath(PATH);
}

export async function logActivityAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  try {
    await WellnessService.logActivity(session.user.tenantId, formData.get("enrollmentId") as string, {
      type: formData.get("type") as WellnessActivityType,
      description: (formData.get("description") as string) || undefined,
    });
  } catch (err) {
    fail(err);
  }
  revalidatePath(PATH);
}

export async function withdrawAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  await WellnessService.withdraw(session.user.tenantId, formData.get("enrollmentId") as string);
  revalidatePath(PATH);
}
