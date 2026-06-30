import { prisma } from "@/lib/prisma";

/**
 * Resolve the Client a new scheme (Group) must belong to (G2.1).
 *
 * A confined/selected `clientId` wins; otherwise the scheme attaches to the
 * operator tenant's default Client (slug `default`). Guarantees Group.clientId
 * is always populated so the column can be NOT NULL. Throws (fail loud) if the
 * tenant has no default Client — that means the G2.1 backfill/seed never ran.
 */
export async function resolveSchemeClientId(
  tenantId: string,
  clientId?: string | null,
): Promise<string> {
  if (clientId) return clientId;

  const fallback = await prisma.client.findFirst({
    where: { operatorTenantId: tenantId, slug: "default" },
    select: { id: true },
  });
  if (!fallback) {
    throw new Error(
      `No default Client for tenant ${tenantId}. Run the G2.1 backfill ` +
        `(prisma/sql/backfill_default_client_g2_1.sql) or db:seed.`,
    );
  }
  return fallback.id;
}
