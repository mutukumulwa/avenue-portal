"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import { TenantProvisioningService } from "@/server/services/tenant-provisioning.service";
import { resolvePlatformGate } from "./platform-gate";
import bcrypt from "bcryptjs";

// Tenant onboarding actions (docs/TENANT_ONBOARDING_PLAN.md). Both actions are
// platform-operator surfaces: they intentionally write ACROSS tenants (a new
// tenant, not the session's), which is why they carry the slug-locked gate on
// top of the SUPER_ADMIN guard.

const PATH = "/settings/tenants";
const ALLOWED_CURRENCIES = ["UGX", "KES", "USD"] as const;
const SLUG_RE = /^[a-z0-9-]+$/;

/** Unique-constraint race (slug backstop) without importing Prisma error classes. */
function isP2002(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// DECISION(B) plug point: branding fields (logoUrl/colors/fonts) and an
// initial-FX-rate field were deliberately deferred — see plan doc §10.

export async function createTenantAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const name = ((formData.get("name") as string) || "").trim();
  const slug = ((formData.get("slug") as string) || "").trim().toLowerCase();
  const currency = ((formData.get("currency") as string) || "").trim().toUpperCase();
  const adminFirstName = ((formData.get("adminFirstName") as string) || "").trim();
  const adminLastName = ((formData.get("adminLastName") as string) || "").trim();
  const adminEmail = ((formData.get("adminEmail") as string) || "").trim().toLowerCase();
  const adminPassword = (formData.get("adminPassword") as string) || "";

  let errorMsg = "";
  let createdSlug = "";
  try {
    const gate = await resolvePlatformGate(session.user.tenantId);
    if (!gate.enabled) throw new Error(gate.message);

    // ── Validation (manual, house style) ──
    if (!name) throw new Error("Tenant name is required.");
    if (!slug || !SLUG_RE.test(slug)) {
      throw new Error("Slug must contain only lowercase letters, digits and hyphens.");
    }
    if (!(ALLOWED_CURRENCIES as readonly string[]).includes(currency)) {
      throw new Error("Currency must be one of UGX, KES or USD.");
    }
    if (!adminFirstName || !adminLastName) throw new Error("Admin first and last name are required.");
    if (!adminEmail || !adminEmail.includes("@")) throw new Error("A valid admin email is required.");
    const pwError = validatePassword(adminPassword);
    if (pwError) throw new Error(pwError);

    // Pre-checks (friendly errors; the DB unique constraints are the backstop).
    const slugTaken = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (slugTaken) throw new Error(`Slug "${slug}" is already taken.`);
    // GLOBAL email check — login (src/lib/auth.ts) resolves email across ALL
    // tenants, so a duplicate in another tenant would shadow one account.
    const emailTaken = await prisma.user.findFirst({ where: { email: adminEmail }, select: { id: true } });
    if (emailTaken) {
      throw new Error(`${adminEmail} is already in use on this platform — logins resolve email globally.`);
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    // ── Atomic core: tenant + first admin in ONE nested create ──
    // The admin must exist BEFORE provisioning so seedRbac's migration step
    // mints their ACTIVE UserRoleAssignment (session permissions at login).
    let tenant: { id: string; users: { id: string }[] };
    try {
      tenant = await prisma.tenant.create({
        data: {
          name,
          slug,
          config: { defaultCurrency: currency }, // read back by provisionTenant on repair
          users: {
            create: {
              email: adminEmail,
              passwordHash,
              firstName: adminFirstName,
              lastName: adminLastName,
              role: "SUPER_ADMIN",
              isActive: true,
            },
          },
        },
        include: { users: { select: { id: true } } },
      });
    } catch (err) {
      if (isP2002(err)) throw new Error(`Slug "${slug}" is already taken — pick another.`);
      throw err;
    }
    const adminUserId = tenant.users[0]?.id ?? "";

    // ── Provisioning OUTSIDE the atomic create (idempotent, repairable) ──
    let provisionError = "";
    let counts: Awaited<ReturnType<typeof TenantProvisioningService.provisionTenant>> | null = null;
    try {
      counts = await TenantProvisioningService.provisionTenant(tenant.id, { currency });
    } catch (err) {
      provisionError = err instanceof Error ? err.message : "provisioning failed";
    }

    // The creation is ALWAYS audited, even when provisioning failed (flat metadata).
    await writeAudit({
      userId: session.user.id,
      action: "TENANT_CREATED",
      module: "SETTINGS",
      description: `Tenant created: ${name} (${slug}), currency ${currency}, first admin ${adminEmail}`,
      metadata: {
        tenantId: tenant.id,
        slug,
        currency,
        adminUserId,
        provisioned: !provisionError,
        ...(counts
          ? {
              reasonCodes: counts.reasonCodes,
              overrideControls: counts.overrideControls,
              serviceCategories: counts.serviceCategories,
              glAccounts: counts.glAccounts,
              roles: counts.roles,
              defaultClientCreated: counts.defaultClient,
            }
          : { provisionError }),
      },
    });

    if (provisionError) {
      throw new Error(
        `Tenant "${slug}" was created, but provisioning failed: ${provisionError}. ` +
          `Fix the cause, then use Re-provision on the tenant row.`,
      );
    }
    createdSlug = slug;
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to create tenant";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
  redirect(`${PATH}?created=${encodeURIComponent(createdSlug)}`);
}

export async function reprovisionTenantAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = ((formData.get("tenantId") as string) || "").trim();

  let errorMsg = "";
  let slugForBanner = "";
  try {
    const gate = await resolvePlatformGate(session.user.tenantId);
    if (!gate.enabled) throw new Error(gate.message);

    if (!tenantId) throw new Error("Tenant id is required.");
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) throw new Error("Tenant not found.");

    // Currency resolves from tenant.config.defaultCurrency inside the service.
    const counts = await TenantProvisioningService.provisionTenant(tenantId);
    await writeAudit({
      userId: session.user.id,
      action: "TENANT_REPROVISIONED",
      module: "SETTINGS",
      description: `Tenant re-provisioned: ${tenant.name} (${tenant.slug})`,
      metadata: {
        tenantId,
        slug: tenant.slug,
        reasonCodes: counts.reasonCodes,
        overrideControls: counts.overrideControls,
        serviceCategories: counts.serviceCategories,
        glAccounts: counts.glAccounts,
        roles: counts.roles,
        defaultClientCreated: counts.defaultClient,
      },
    });
    slugForBanner = tenant.slug;
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Re-provision failed";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
  redirect(`${PATH}?reprovisioned=${encodeURIComponent(slugForBanner)}`);
}
