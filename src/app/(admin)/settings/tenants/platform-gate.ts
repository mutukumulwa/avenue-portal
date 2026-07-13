import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

// ─── PLATFORM-OPERATOR GATE (docs/TENANT_ONBOARDING_PLAN.md §4) ──────────────
// SUPER_ADMIN is tenant-scoped and the schema has no platform-level role, so
// tenant management is additionally slug-locked to the platform operator's own
// tenant, FAIL-CLOSED (same convention as API_KEY / OPERATOR_TENANT_ID, BD-06):
//   - PLATFORM_TENANT_SLUG unset/blank → feature disabled (caller renders the
//     explainer / refuses the mutation).
//   - Set, but the session tenant's slug differs → /unauthorized.
// Lives in its own module because every export of a "use server" actions file
// must itself be a server action — shared helpers cannot live in actions.ts.

export const PLATFORM_GATE_DISABLED_MESSAGE =
  "Tenant management is disabled: set PLATFORM_TENANT_SLUG to the platform operator tenant's slug. " +
  "The feature fails closed while the variable is missing.";

export async function resolvePlatformGate(
  sessionTenantId: string,
): Promise<{ enabled: false; message: string } | { enabled: true }> {
  const platformSlug = (process.env.PLATFORM_TENANT_SLUG ?? "").trim();
  if (!platformSlug) {
    return { enabled: false, message: PLATFORM_GATE_DISABLED_MESSAGE };
  }
  const me = await prisma.tenant.findUnique({
    where: { id: sessionTenantId },
    select: { slug: true },
  });
  if (!me || me.slug !== platformSlug) redirect("/unauthorized");
  return { enabled: true };
}
