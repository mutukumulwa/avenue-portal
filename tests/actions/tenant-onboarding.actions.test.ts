import { describe, it, expect, vi, beforeEach } from "vitest";

// Tenant onboarding actions (docs/TENANT_ONBOARDING_PLAN.md §3-5): slug-locked
// fail-closed gate, global email uniqueness, atomic nested create, provisioning
// outside the create with an audited partial-failure path.

const mockPrisma = vi.hoisted(() => ({
  tenant: { create: vi.fn(), findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn().mockResolvedValue({ user: { id: "admin-1", tenantId: "t1" } }),
  ROLES: { ADMIN_ONLY: ["SUPER_ADMIN"] },
}));

const writeAudit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ writeAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Mirror Next's redirect(): throws an error whose message is NEXT_REDIRECT so
// the actions' catch blocks re-throw it exactly like production.
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string): never => {
    const e = new Error("NEXT_REDIRECT") as Error & { url: string };
    e.url = url;
    throw e;
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const provisionTenant = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/tenant-provisioning.service", () => ({
  TenantProvisioningService: { provisionTenant },
}));

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed-pw") } }));
// @/lib/password-policy is NOT mocked — exercise the real rules (min 10 + classes).

import { createTenantAction, reprovisionTenantAction } from "@/app/(admin)/settings/tenants/actions";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const VALID = {
  name: "Acme TPA",
  slug: "acme-tpa",
  currency: "KES",
  adminFirstName: "Jane",
  adminLastName: "Doe",
  adminEmail: "Jane@Acme.example",
  adminPassword: "Sup3rSecret#1",
};

const PROVISION_COUNTS = {
  reasonCodes: 12,
  overrideControls: 5,
  serviceCategories: 47,
  glAccounts: 24,
  roles: 17,
  defaultClient: true,
};

/** Run an action, return the FIRST redirect URL it issued. */
async function runExpectingRedirect(promise: Promise<unknown>): Promise<string> {
  await expect(promise).rejects.toThrow("NEXT_REDIRECT");
  expect(redirectMock).toHaveBeenCalled();
  return redirectMock.mock.calls[0][0];
}

/** tenant.findUnique dispatcher: session-tenant gate lookup vs slug pre-check vs target tenant. */
function primeTenantFindUnique(opts?: { sessionSlug?: string; slugTaken?: boolean; target?: { id: string; name: string; slug: string } | null }) {
  mockPrisma.tenant.findUnique.mockImplementation(async (args: { where: { id?: string; slug?: string } }) => {
    if (args.where.id === "t1") return { slug: opts?.sessionSlug ?? "medvex" };
    if (args.where.id) return opts?.target !== undefined ? opts.target : null;
    if (args.where.slug) return opts?.slugTaken ? { id: "existing" } : null;
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PLATFORM_TENANT_SLUG", "medvex");
  primeTenantFindUnique();
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.tenant.create.mockResolvedValue({ id: "t2", users: [{ id: "u-new" }] });
  provisionTenant.mockResolvedValue(PROVISION_COUNTS);
});

describe("createTenantAction — platform gate (fail closed)", () => {
  it("refuses when PLATFORM_TENANT_SLUG is unset", async () => {
    vi.stubEnv("PLATFORM_TENANT_SLUG", "");
    const url = await runExpectingRedirect(createTenantAction(fd(VALID)));
    expect(url).toContain("/settings/tenants?error=");
    expect(decodeURIComponent(url)).toContain("PLATFORM_TENANT_SLUG");
    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
  });

  it("redirects to /unauthorized when the session tenant's slug mismatches", async () => {
    primeTenantFindUnique({ sessionSlug: "some-other-tenant" });
    const url = await runExpectingRedirect(createTenantAction(fd(VALID)));
    expect(url).toBe("/unauthorized");
    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
  });
});

describe("createTenantAction — validation", () => {
  it("rejects a malformed slug", async () => {
    const url = await runExpectingRedirect(createTenantAction(fd({ ...VALID, slug: "Bad Slug!" })));
    expect(decodeURIComponent(url)).toContain("lowercase letters, digits and hyphens");
    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
  });

  it("rejects a password failing the real policy", async () => {
    const url = await runExpectingRedirect(createTenantAction(fd({ ...VALID, adminPassword: "short" })));
    expect(decodeURIComponent(url)).toContain("at least 10 characters");
    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
  });

  it("rejects a currency outside the allowlist", async () => {
    const url = await runExpectingRedirect(createTenantAction(fd({ ...VALID, currency: "EUR" })));
    expect(decodeURIComponent(url)).toContain("UGX, KES or USD");
    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
  });

  it("rejects an email already in use in ANY tenant (global check, no tenant filter)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u9" });
    const url = await runExpectingRedirect(createTenantAction(fd(VALID)));
    expect(decodeURIComponent(url)).toContain("already in use on this platform");
    // The whole point: the lookup must NOT be tenant-scoped.
    expect(mockPrisma.user.findFirst.mock.calls[0][0].where).toEqual({ email: "jane@acme.example" });
    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
  });

  it("maps a P2002 race on tenant.create to a friendly slug error", async () => {
    mockPrisma.tenant.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const url = await runExpectingRedirect(createTenantAction(fd(VALID)));
    expect(decodeURIComponent(url)).toContain('Slug "acme-tpa" is already taken');
    expect(provisionTenant).not.toHaveBeenCalled();
  });
});

describe("createTenantAction — orchestration", () => {
  it("happy path: creates tenant+admin atomically, provisions, audits, redirects", async () => {
    const url = await runExpectingRedirect(createTenantAction(fd(VALID)));

    expect(mockPrisma.tenant.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrisma.tenant.create.mock.calls[0][0];
    expect(createArg.data.name).toBe("Acme TPA");
    expect(createArg.data.slug).toBe("acme-tpa");
    expect(createArg.data.config).toEqual({ defaultCurrency: "KES" });
    expect(createArg.data.users.create).toEqual({
      email: "jane@acme.example",
      passwordHash: "hashed-pw",
      firstName: "Jane",
      lastName: "Doe",
      role: "SUPER_ADMIN",
      isActive: true,
    });

    expect(provisionTenant).toHaveBeenCalledWith("t2", { currency: "KES" });

    expect(writeAudit).toHaveBeenCalledTimes(1);
    const audit = writeAudit.mock.calls[0][0];
    expect(audit.action).toBe("TENANT_CREATED");
    expect(audit.module).toBe("SETTINGS");
    expect(audit.metadata).toMatchObject({
      tenantId: "t2",
      slug: "acme-tpa",
      currency: "KES",
      adminUserId: "u-new",
      provisioned: true,
      roles: 17,
      glAccounts: 24,
    });

    expect(url).toBe("/settings/tenants?created=acme-tpa");
  });

  it("partial failure: provisioning error still audits, then redirects with a repair hint", async () => {
    provisionTenant.mockRejectedValue(new Error("db down"));
    const url = await runExpectingRedirect(createTenantAction(fd(VALID)));

    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit.mock.calls[0][0].metadata).toMatchObject({
      provisioned: false,
      provisionError: "db down",
    });
    expect(decodeURIComponent(url)).toContain("Re-provision");
  });
});

describe("reprovisionTenantAction", () => {
  it("re-provisions an existing tenant and audits", async () => {
    primeTenantFindUnique({ target: { id: "t2", name: "Acme TPA", slug: "acme-tpa" } });
    const url = await runExpectingRedirect(reprovisionTenantAction(fd({ tenantId: "t2" })));

    expect(provisionTenant).toHaveBeenCalledWith("t2"); // currency resolves from tenant.config
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit.mock.calls[0][0].action).toBe("TENANT_REPROVISIONED");
    expect(url).toBe("/settings/tenants?reprovisioned=acme-tpa");
  });

  it("rejects an unknown tenant id", async () => {
    primeTenantFindUnique({ target: null });
    const url = await runExpectingRedirect(reprovisionTenantAction(fd({ tenantId: "ghost" })));
    expect(decodeURIComponent(url)).toContain("Tenant not found");
    expect(provisionTenant).not.toHaveBeenCalled();
  });

  it("is gated like create: unset env refuses before touching anything", async () => {
    vi.stubEnv("PLATFORM_TENANT_SLUG", "");
    const url = await runExpectingRedirect(reprovisionTenantAction(fd({ tenantId: "t2" })));
    expect(decodeURIComponent(url)).toContain("PLATFORM_TENANT_SLUG");
    expect(provisionTenant).not.toHaveBeenCalled();
  });
});
