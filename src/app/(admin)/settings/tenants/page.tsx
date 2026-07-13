import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { reprovisionTenantAction } from "./actions";
import { resolvePlatformGate } from "./platform-gate";
import { TenantCreateForm } from "./TenantCreateForm";
import Link from "next/link";
import { Building2 } from "lucide-react";

// Tenant onboarding surface (docs/TENANT_ONBOARDING_PLAN.md). Platform-operator
// only: SUPER_ADMIN + slug-locked to PLATFORM_TENANT_SLUG (fail closed).

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; reprovisioned?: string }>;
}) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const { error, created, reprovisioned } = await searchParams;

  const gate = await resolvePlatformGate(session.user.tenantId);
  if (!gate.enabled) {
    // Fail closed: no form, no cross-tenant list — just the explainer.
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-brand-secondary" />
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Tenants</h1>
        </div>
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {gate.message}
        </div>
      </div>
    );
  }

  // INTENTIONALLY cross-tenant: this is the platform-operator surface, so the
  // query does NOT filter by session.user.tenantId — it lists every tenant.
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: {
        select: {
          users: true,
          roles: true,
          chartOfAccounts: true,
          serviceCategories: true,
          clients: { where: { slug: "default" } },
        },
      },
    },
  });

  // Success-panel context. The admin email is deliberately never echoed —
  // only the slug rides in the URL.
  const createdTenant = created ? (tenants.find((t) => t.slug === created) ?? null) : null;
  const createdDefaultClient = createdTenant
    ? await prisma.client.findFirst({
        where: { operatorTenantId: createdTenant.id, slug: "default" },
        select: { currency: true },
      })
    : null;
  const needsFxRate = !!createdDefaultClient && createdDefaultClient.currency !== "UGX";

  const chip = (ok: boolean, okLabel: string, badLabel: string) => (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
        ok ? "bg-brand-success/10 text-brand-success" : "bg-brand-coral/10 text-brand-coral"
      }`}
    >
      {ok ? okLabel : badLabel}
    </span>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-brand-secondary" />
        <div>
          <h1 className="text-2xl font-heading font-bold text-brand-text-heading">Tenants</h1>
          <p className="text-sm text-brand-text-muted">
            Platform operator surface — create and repair TPA operator organisations. Every
            tenant is provisioned with its default client, roles, chart of accounts and
            reference catalogs.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {error}
        </div>
      )}

      {reprovisioned && (
        <div className="rounded-md border border-brand-success/30 bg-brand-success/10 px-4 py-3 text-sm text-brand-success">
          Tenant “{reprovisioned}” re-provisioned — all reference data topped up (idempotent).
        </div>
      )}

      {createdTenant && (
        <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
          <h2 className="text-sm font-semibold text-brand-success">
            Tenant “{createdTenant.name}” ({createdTenant.slug}) is live
          </h2>
          <p className="mt-1 text-xs text-brand-text-muted">Go-live checklist for the new tenant’s admin:</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-brand-text-body">
            <li>
              Sign in at{" "}
              <Link href="/login" className="font-semibold text-brand-teal hover:underline">
                /login
              </Link>{" "}
              with the admin email and the password you just set.
            </li>
            {needsFxRate && (
              <li className="rounded-md bg-brand-coral/10 px-2 py-1 font-medium text-brand-coral">
                Capture a {createdDefaultClient?.currency}→UGX rate in Settings → FX Rates as the new
                tenant’s admin — claim approval fails closed without an in-force rate.
              </li>
            )}
            <li>Invite the rest of the team (Settings → Users &amp; Access).</li>
            <li>Review branding and the member-number prefix, then create Clients, Groups, Packages and Providers.</li>
          </ol>
        </section>
      )}

      <section className="rounded-lg border border-brand-border bg-brand-bg p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase text-brand-text-muted">Create tenant</h2>
        <TenantCreateForm />
      </section>

      <section className="overflow-x-auto rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
            <tr>
              <th className="px-4 py-2.5">Tenant</th>
              <th className="px-4 py-2.5">Created</th>
              <th className="px-4 py-2.5 text-right">Users</th>
              <th className="px-4 py-2.5 text-right">Roles</th>
              <th className="px-4 py-2.5 text-right">GL accounts</th>
              <th className="px-4 py-2.5 text-right">Categories</th>
              <th className="px-4 py-2.5">Default client</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {tenants.map((t) => {
              const provisioned =
                t._count.users > 0 &&
                t._count.roles > 0 &&
                t._count.chartOfAccounts > 0 &&
                t._count.serviceCategories > 0 &&
                t._count.clients > 0;
              return (
                <tr key={t.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-brand-text-heading">{t.name}</div>
                    <div className="font-mono text-xs text-brand-text-muted">{t.slug}</div>
                  </td>
                  <td className="px-4 py-2.5 text-brand-text-body">{t.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2.5 text-right text-brand-text-body">{t._count.users}</td>
                  <td className="px-4 py-2.5 text-right text-brand-text-body">{t._count.roles}</td>
                  <td className="px-4 py-2.5 text-right text-brand-text-body">{t._count.chartOfAccounts}</td>
                  <td className="px-4 py-2.5 text-right text-brand-text-body">{t._count.serviceCategories}</td>
                  <td className="px-4 py-2.5">{chip(t._count.clients > 0, "Present", "Missing")}</td>
                  <td className="px-4 py-2.5">{chip(provisioned, "Provisioned", "Incomplete")}</td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={reprovisionTenantAction}>
                      <input type="hidden" name="tenantId" value={t.id} />
                      <button className="text-xs font-semibold text-brand-teal hover:underline">Re-provision</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
