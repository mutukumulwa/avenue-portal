import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { prisma } from "@/lib/prisma";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { MASTER_DATA_CHANGE_PERMISSION } from "@/server/services/provider-master-data-change/service";
import { MASTER_DATA_CATEGORY_POLICY } from "@/server/services/provider-master-data-change/policy";
import { RequestChangeForm } from "./RequestChangeForm";

/**
 * PNOS F7.6 — submit a provider master-data change request. The form is driven by
 * the F7.4 category policy (only allow-listed fields are offered) and delegates to
 * the service, which re-validates + masks server-side. No active data is mutated.
 */
export default async function NewChangeRequest() {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, MASTER_DATA_CHANGE_PERMISSION)) redirect("/unauthorized");
  const branches = await prisma.providerBranch.findMany({ where: { providerId: ctx.providerId, tenantId: ctx.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  // Pass the plain policy object (allow-listed fields per category) to the client form.
  const policy = Object.fromEntries(Object.entries(MASTER_DATA_CATEGORY_POLICY).map(([k, p]) => [k, { allowedFields: p.allowedFields, sensitiveFields: p.sensitiveFields, requiresEvidence: p.requiresEvidence, risk: p.risk, scope: p.scope }]));
  return <RequestChangeForm policy={policy} branches={branches} />;
}
