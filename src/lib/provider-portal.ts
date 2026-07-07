import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

/**
 * Gate for every provider-portal server component / action. Ensures the caller
 * is a PROVIDER_USER bound to a real Provider, and returns that provider so all
 * queries can be hard-scoped to it (a facility user only ever sees its own
 * members-eligibility, claims and settlements).
 */
export async function requireProvider() {
  const session = await requireRole(ROLES.PROVIDER);
  const providerId = session.user.providerId;
  if (!providerId) redirect("/unauthorized");

  const provider = await prisma.provider.findFirst({
    where: { id: providerId, tenantId: session.user.tenantId },
    select: { id: true, name: true, type: true, tier: true, contractStatus: true, county: true },
  });
  if (!provider) redirect("/unauthorized");

  return { session, providerId: provider.id, provider, tenantId: session.user.tenantId };
}
