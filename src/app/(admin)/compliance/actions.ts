"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { ComplianceService } from "@/server/services/compliance.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

const PATH = "/compliance";

function fail(message: string): never {
  redirect(`${PATH}?error=${encodeURIComponent(message)}`);
}

export async function recordLicenceAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const number = ((formData.get("number") as string) || "").trim();
  const issuedAt = new Date((formData.get("issuedAt") as string) || "");
  const expiresAt = new Date((formData.get("expiresAt") as string) || "");
  if (!number || isNaN(issuedAt.getTime()) || isNaN(expiresAt.getTime())) fail("Licence number, issue and expiry dates are required.");
  if (expiresAt <= issuedAt) fail("Licence expiry must be after issue.");

  await prisma.regulatoryLicence.create({
    data: { tenantId: session.user.tenantId, type: "TPA_LICENCE", number, issuedAt, expiresAt },
  });
  await writeAudit({
    userId: session.user.id,
    action: "COMPLIANCE_LICENCE_RECORDED",
    module: "COMPLIANCE",
    description: `TPA licence ${number} recorded (expires ${expiresAt.toISOString().slice(0, 10)})`,
    metadata: { number },
  });
  revalidatePath(PATH);
}

export async function recordDirectorAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const name = ((formData.get("name") as string) || "").trim();
  const role = ((formData.get("role") as string) || "").trim() || null;
  const isResident = formData.get("isResident") === "on";
  if (!name) fail("Director name is required.");

  await prisma.directorRegister.create({
    data: { tenantId: session.user.tenantId, name, role, isResident, appointedAt: new Date() },
  });
  await writeAudit({
    userId: session.user.id,
    action: "COMPLIANCE_DIRECTOR_RECORDED",
    module: "COMPLIANCE",
    description: `Director ${name} recorded (${isResident ? "Uganda-resident" : "non-resident"})`,
    metadata: { name, isResident },
  });
  revalidatePath(PATH);
}

export async function endDirectorAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const director = await prisma.directorRegister.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, name: true },
  });
  if (!director) return;
  await prisma.directorRegister.update({
    where: { id },
    data: { isActive: false, effectiveTo: new Date() },
  });
  await writeAudit({
    userId: session.user.id,
    action: "COMPLIANCE_DIRECTOR_ENDED",
    module: "COMPLIANCE",
    description: `Director ${director.name} tenure ended`,
    metadata: { directorId: id },
  });
  revalidatePath(PATH);
}

export async function computeLevyAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const period = ((formData.get("period") as string) || "").trim();
  const ratePercent = Number(formData.get("ratePercent"));
  if (!/^\d{4}$/.test(period)) fail("Levy period must be a year, e.g. 2026.");
  if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent > 100) fail("Levy rate must be a percentage between 0 and 100.");

  const levy = await ComplianceService.computeLevy(session.user.tenantId, period, ratePercent);
  await writeAudit({
    userId: session.user.id,
    action: "COMPLIANCE_LEVY_COMPUTED",
    module: "COMPLIANCE",
    description: `IRA levy computed for ${period}: ${Number(levy.amount).toLocaleString()} ${levy.currency} (basis ${Number(levy.feesReceivedBasis).toLocaleString()} @ ${ratePercent}%)`,
    metadata: { period, ratePercent, amount: Number(levy.amount) },
  });
  revalidatePath(PATH);
}
