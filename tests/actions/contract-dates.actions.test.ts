/**
 * UAT-HF P02.01 acceptance — "five/six-digit years, impossible dates, inverted
 * ranges, malformed imports, and direct forged actions produce NO WRITE and a
 * field-specific error."
 *
 * The distinction that matters: rejecting the input in the browser is not the
 * fix. DEF-050's row was created through the product's own form by a permitted
 * Underwriter-Maker, and a Server Action can be invoked directly regardless of
 * what the form allows. So the assertion here is on `prisma.providerContract
 * .create` never being called — not on a message alone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireRole = vi.hoisted(() => vi.fn(async () => ({ user: { id: "uw-1", tenantId: "t1" } })));
vi.mock("@/lib/rbac", () => ({ requireRole, ROLES: { UNDERWRITING: ["UNDERWRITER"] } }));

const db = vi.hoisted(() => ({
  provider: { findUnique: vi.fn(async () => ({ id: "prov-1", tenantId: "t1" })) },
  providerContract: { create: vi.fn(async (_a: MockDbArgs) => ({ id: "contract-1" })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const redirect = vi.hoisted(() =>
  vi.fn((url: string): never => {
    const e = new Error("NEXT_REDIRECT") as Error & { url: string };
    e.url = url;
    throw e;
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

vi.mock("@/server/services/provider-contracts.service", () => ({
  ProviderContractsService: { nextContractNumber: vi.fn(async () => "PC-2026-999") },
}));
vi.mock("@/server/services/contract-lifecycle.service", () => ({ ContractLifecycleService: {} }));

import { createContractAction } from "@/app/(admin)/contracts/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const VALID = { providerId: "prov-1", title: "Nile Metropolitan rate schedule" };

/** Run the action and return the URL it redirected to. */
async function run(fields: Record<string, string>): Promise<string> {
  try {
    await createContractAction(form(fields));
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (url) return url;
    throw e;
  }
  throw new Error("action did not redirect");
}

beforeEach(() => vi.clearAllMocks());

describe("P02.01 createContractAction — no write on a bad date", () => {
  it("refuses the exact DEF-050 dates and writes NOTHING", async () => {
    const url = await run({ ...VALID, startDate: "60901-02-20", endDate: "70831-02-20" });

    // The assertion the defect actually needs.
    expect(db.providerContract.create).not.toHaveBeenCalled();
    expect(url).toContain("/contracts/new?error=");
    const message = decodeURIComponent(url.split("error=")[1]);
    // Field-specific, naming what the user sees on screen.
    expect(message).toContain("Start date");
    expect(message).toContain("End date");
  });

  it("refuses an inverted range and names the end date", async () => {
    const url = await run({ ...VALID, startDate: "2027-01-01", endDate: "2026-01-01" });
    expect(db.providerContract.create).not.toHaveBeenCalled();
    expect(decodeURIComponent(url)).toMatch(/End date: .*on or after the start date/i);
  });

  it("refuses an impossible day", async () => {
    await run({ ...VALID, startDate: "2026-02-30", endDate: "2027-01-01" });
    expect(db.providerContract.create).not.toHaveBeenCalled();
  });

  it("refuses a bad optional review date without touching the database", async () => {
    await run({ ...VALID, startDate: "2026-08-11", endDate: "2027-08-10", reviewDueDate: "70831-02-20" });
    expect(db.providerContract.create).not.toHaveBeenCalled();
  });

  it("validates BEFORE looking the provider up, so a bad date costs no query", async () => {
    await run({ ...VALID, startDate: "60901-02-20", endDate: "70831-02-20" });
    expect(db.provider.findUnique).not.toHaveBeenCalled();
  });

  it("still refuses when the date is absent entirely", async () => {
    await run({ ...VALID, startDate: "", endDate: "" });
    expect(db.providerContract.create).not.toHaveBeenCalled();
  });
});

describe("P02.01 createContractAction — a valid term still writes", () => {
  it("creates the contract with midnight-UTC dates", async () => {
    const url = await run({
      ...VALID,
      startDate: "2026-08-11",
      endDate: "2027-08-10",
      reviewDueDate: "2027-05-01",
    });

    expect(db.providerContract.create).toHaveBeenCalledTimes(1);
    const data = db.providerContract.create.mock.calls[0][0].data as Record<string, Date | null>;
    // Midnight UTC, so the stored day cannot drift with the server's timezone.
    expect(data.startDate!.toISOString()).toBe("2026-08-11T00:00:00.000Z");
    expect(data.endDate!.toISOString()).toBe("2027-08-10T00:00:00.000Z");
    expect(data.reviewDueDate!.toISOString()).toBe("2027-05-01T00:00:00.000Z");
    expect(url).toBe("/contracts/contract-1");
  });

  it("accepts a single-day term (DEC-02 allows end == start)", async () => {
    await run({ ...VALID, startDate: "2026-08-11", endDate: "2026-08-11" });
    expect(db.providerContract.create).toHaveBeenCalledTimes(1);
  });

  it("accepts a null review date", async () => {
    await run({ ...VALID, startDate: "2026-08-11", endDate: "2027-08-10" });
    const data = db.providerContract.create.mock.calls[0][0].data as Record<string, Date | null>;
    expect(data.reviewDueDate).toBeNull();
  });
});
