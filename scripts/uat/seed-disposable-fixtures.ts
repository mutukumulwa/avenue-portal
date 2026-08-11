/**
 * Wave 4 / DEF-025 · Disposable UAT fixture lane (plan §7.2).
 *
 * Provisions the DISPOSABLE data lane the run-03 workbook blocked on: named
 * `Lakeview UAT Disposable — <Scenario ID> — <Run ID>` per the workbook's
 * "00 Start Here" lane rules (rows 38–43), so the destructive Plan/Scheme/Tariff
 * boundary scenarios never mutate the controlled Lakeview package/scheme.
 *
 * It creates, with the EXACT Contract-Truth baselines (04 Contract Truth):
 *   - disposable PACKAGES for P-006 (copay 0/10/100), P-007 (waiting 0/270),
 *     P-008 (annual/sublimit), P-009 (precision), P-011 (shared-limit),
 *     P-013 (copay-conflict) + an S-BASE package the disposable schemes bind to;
 *   - disposable SCHEMES for S-004 (future-start + past-start) and S-006
 *     (lifecycle) under the Lakeview client;
 *   - disposable PROVIDERS + tariff rows for N-009 (validation control) and
 *     N-011 (in-use candidate + never-used control).
 *
 * It writes through the SAME validated service/model paths the product uses
 * (`PackagesService.createPackage`, `GroupsService.createGroup`,
 * `ProvidersService.createProvider`, and the `cptTariffSchema` + `detectTariffOverlap`
 * write mirrored from `upsertCptTariffAction`) so a fixture that cannot be
 * created the way the app creates it is itself a finding — surfaced, not
 * swallowed. Package baselines are additionally pre-validated against the
 * canonical `packageCreateSchema` before any write.
 *
 * SAFETY: DRY-RUN by default — it PRINTS the plan and writes NOTHING. It only
 * writes when APPLY=1, and only ever touches disposable, run-tagged records
 * (idempotent: an existing record with the same name is left untouched). It is a
 * run-at-deploy harness script, not product code.
 *
 *   # dry run — prints the plan (with DATABASE_URL: resolves real targets + existence)
 *   DATABASE_URL=postgres://…5432/db UAT_RUN_ID=2026-08-11-01 npx tsx scripts/uat/seed-disposable-fixtures.ts
 *   # apply
 *   APPLY=1 DATABASE_URL=postgres://…5432/db UAT_RUN_ID=2026-08-11-01 npx tsx scripts/uat/seed-disposable-fixtures.ts
 */
import { prisma } from "../../src/lib/prisma";
import { PackagesService } from "../../src/server/services/packages.service";
import { GroupsService } from "../../src/server/services/groups.service";
import { ProvidersService } from "../../src/server/services/providers.service";
import { packageCreateSchema } from "../../src/lib/validation/package";
import { cptTariffSchema, detectTariffOverlap } from "../../src/lib/validation/tariff";
import { normalizeLegalName } from "../../src/lib/normalize";

// ── Config ───────────────────────────────────────────────────────────────────
const APPLY = process.env.APPLY === "1";
const hasDb = Boolean(process.env.DATABASE_URL);
const runIdRaw = process.env.UAT_RUN_ID || "";
const runId = runIdRaw
  .toLowerCase()
  .replace(/[^a-z0-9-]/g, "-")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 40);
if (APPLY && !hasDb) throw new Error("APPLY=1 requires DATABASE_URL.");
if (APPLY && !runId) throw new Error("APPLY=1 requires UAT_RUN_ID (disposable records must be run-tagged for cleanup).");
const RUN = runId || "<run-id>";

/** Disposable lane name per "00 Start Here" rows 38–43 (em dash, spaced). */
const lane = (scenario: string) => `Lakeview UAT Disposable — ${scenario} — ${RUN}`;

// ── Contract-Truth baselines (04 Contract Truth) ─────────────────────────────
const CT = {
  clientLegalName: "Lakeview Manufacturing Uganda Limited", // CT-001
  currency: "UGX", // CT-003
  policyStart: "2026-08-01", // CT-006
  overallAnnualLimit: 25_000_000, // CT-010
  outpatientSubLimit: 2_000_000, // CT-011
  outpatientPerVisit: 300_000, // CT-012
  outpatientCopayPct: 10, // CT-013 (0.1 → whole-percent 10; product stores 0–100)
  inpatientSubLimit: 15_000_000, // CT-014
  maternityFamilySubLimit: 3_000_000, // CT-015
  maternityWaitingDays: 270, // CT-016
  dentalSubLimit: 500_000, // CT-017
  opticalSubLimit: 500_000, // CT-018
  principalMaxAge: 65, // CT-032
  dependentMaxAge: 24, // CT-031
  consultationTariff: 50_000, // CT-028
  cbcTariff: 35_000, // CT-029
} as const;

// ── Spec types (extracted from the real services → drift-proof) ──────────────
type PackageData = Parameters<typeof PackagesService.createPackage>[1];
type GroupData = Parameters<typeof GroupsService.createGroup>[1];
type ProviderData = Parameters<typeof ProvidersService.createProvider>[1];

type PackageSpec = { scenario: string; note: string; data: PackageData };
type SchemeSpec = { scenario: string; note: string; effectiveDate: string; contact: { name: string; phone: string; email: string } };
type TariffSpec = { serviceName: string; agreedRate: number; note: string };
type ProviderSpec = { scenario: string; note: string; data: Omit<ProviderData, "name">; tariffs: TariffSpec[] };

const FIXTURE_CONTACT = {
  name: "UAT Fixture Contact",
  phone: "+256700000000",
  email: "uat.fixture+disposable@example.invalid",
};

// ── Disposable PACKAGES (P-006..P-013 + S-BASE) ──────────────────────────────
function packageSpecs(): PackageSpec[] {
  const base = {
    type: "FAMILY" as const,
    annualLimit: CT.overallAnnualLimit,
    contributionAmount: 0,
    minAge: 0,
    maxAge: CT.principalMaxAge,
    dependentMaxAge: CT.dependentMaxAge,
    status: "ACTIVE" as const,
  };
  const outpatient = {
    category: "OUTPATIENT" as const,
    annualSubLimit: CT.outpatientSubLimit,
    perVisitLimit: CT.outpatientPerVisit,
    copayPercentage: CT.outpatientCopayPct,
    waitingPeriodDays: 0,
  };
  const maternity = {
    category: "MATERNITY" as const,
    annualSubLimit: CT.maternityFamilySubLimit,
    copayPercentage: 0,
    waitingPeriodDays: CT.maternityWaitingDays,
  };
  const inpatient = { category: "INPATIENT" as const, annualSubLimit: CT.inpatientSubLimit, copayPercentage: 0, waitingPeriodDays: 0 };
  const dental = { category: "DENTAL" as const, annualSubLimit: CT.dentalSubLimit, copayPercentage: 0, waitingPeriodDays: 0 };
  const optical = { category: "OPTICAL" as const, annualSubLimit: CT.opticalSubLimit, copayPercentage: 0, waitingPeriodDays: 0 };

  return [
    {
      scenario: "P-006",
      note: "Copay 0/10/100 boundary — OUTPATIENT copay baseline 10% (CT-013).",
      data: { ...base, name: lane("P-006"), description: "Disposable copay-boundary plan (CT-013).", benefits: [outpatient] },
    },
    {
      scenario: "P-007",
      note: "Waiting 0/270 boundary — MATERNITY waiting baseline 270 days (CT-016).",
      data: { ...base, name: lane("P-007"), description: "Disposable waiting-period plan (CT-016).", benefits: [maternity, outpatient] },
    },
    {
      scenario: "P-008",
      note: "Annual/sublimit consistency — overall 25M vs sublimits (CT-010..CT-018).",
      data: { ...base, name: lane("P-008"), description: "Disposable annual/sublimit plan (CT-010..CT-018).", benefits: [outpatient, inpatient, maternity, dental, optical] },
    },
    {
      scenario: "P-009",
      note: "Decimal/rounding precision — OUTPATIENT money fields (2M sublimit, 300k per-visit, 10% copay).",
      data: { ...base, name: lane("P-009"), description: "Disposable precision plan (money rounding).", benefits: [outpatient] },
    },
    {
      scenario: "P-011",
      note: "Shared-limit validation/overlap — MATERNITY family pool + ≥2 shareable benefits.",
      data: { ...base, name: lane("P-011"), description: "Disposable shared-limit plan (CT-015 family pool).", benefits: [maternity, dental, optical] },
    },
    {
      scenario: "P-013",
      note: "Fixed vs percentage copay conflict — OUTPATIENT baseline for co-contribution rules.",
      data: { ...base, name: lane("P-013"), description: "Disposable copay-conflict plan.", benefits: [{ category: "OUTPATIENT" as const, annualSubLimit: CT.outpatientSubLimit, copayPercentage: CT.outpatientCopayPct, waitingPeriodDays: 0 }] },
    },
    {
      scenario: "S-BASE",
      note: "Base plan the disposable S-004/S-006 schemes bind to (full CT benefit schedule).",
      data: { ...base, name: lane("S-BASE"), description: "Disposable scheme base plan (CT benefit schedule).", benefits: [outpatient, inpatient, maternity, dental, optical] },
    },
  ];
}

// ── Disposable SCHEMES (S-004 future/past, S-006 lifecycle) ──────────────────
function schemeSpecs(): SchemeSpec[] {
  const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return [
    { scenario: "S-004-future", note: "Future-start scheme — not eligible before start.", effectiveDate: future, contact: FIXTURE_CONTACT },
    { scenario: "S-004-past", note: "Past-start active scheme — eligible subject to member dates.", effectiveDate: CT.policyStart, contact: FIXTURE_CONTACT },
    { scenario: "S-006", note: "Lifecycle scheme — ACTIVE→LAPSED/TERMINATED terminal transitions.", effectiveDate: CT.policyStart, contact: FIXTURE_CONTACT },
  ];
}

// ── Disposable PROVIDERS + tariffs (N-009, N-011) ────────────────────────────
function providerSpecs(): ProviderSpec[] {
  const providerBase: Omit<ProviderData, "name"> = {
    type: "CLINIC",
    tier: "PARTNER", // CT-026 allows OWN and PARTNER
    servicesOffered: ["General Consultation", "Complete Blood Count"],
    paymentTermDays: 30,
    contractStatus: "ACTIVE",
    contractStartDate: CT.policyStart,
  };
  return [
    {
      scenario: "N-009",
      note: "Tariff validation — a valid consultation control to compare invalid attempts against.",
      data: providerBase,
      tariffs: [{ serviceName: "General Consultation", agreedRate: CT.consultationTariff, note: "Valid control (CT-028)." }],
    },
    {
      scenario: "N-011",
      note: "In-use tariff delete — an in-use consultation candidate + a never-used control.",
      data: providerBase,
      tariffs: [
        { serviceName: "General Consultation (in-use)", agreedRate: CT.consultationTariff, note: "In-use candidate (CT-028); run references it then attempts delete." },
        { serviceName: "Complete Blood Count (never-used control)", agreedRate: CT.cbcTariff, note: "Never-used control (CT-029)." },
      ],
    },
  ];
}

// ── Runners ──────────────────────────────────────────────────────────────────
type Status = "VALID" | "EXISTS" | "CREATED" | "WOULD CREATE" | "FINDING";
function line(status: Status, label: string, extra = "") {
  const tag = status.padEnd(12);
  console.log(`  [${tag}] ${label}${extra ? `  — ${extra}` : ""}`);
}

async function validatePackages(specs: PackageSpec[]): Promise<boolean> {
  let ok = true;
  console.log("\n== Package baseline validation (packageCreateSchema) ==");
  for (const s of specs) {
    const parsed = packageCreateSchema.safeParse(s.data);
    if (parsed.success) {
      line("VALID", `${s.scenario} — ${s.data.name}`, "baseline passes packageCreateSchema");
    } else {
      ok = false;
      line("FINDING", `${s.scenario} — ${s.data.name}`, `INVALID BASELINE: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
    }
  }
  return ok;
}

async function resolveTenant() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true, slug: true }, orderBy: { createdAt: "asc" } });
  const wantSlug = process.env.UAT_TENANT_SLUG || process.env.PLATFORM_TENANT_SLUG;
  const tenant =
    tenants.find((t) => t.id === process.env.OPERATOR_TENANT_ID) ||
    (wantSlug ? tenants.find((t) => t.slug === wantSlug) : undefined) ||
    tenants[0];
  if (!tenant) throw new Error("No tenant exists in this database.");
  return tenant;
}

async function resolveLakeviewClient(tenantId: string) {
  const wanted = normalizeLegalName(CT.clientLegalName);
  const client = await prisma.client.findFirst({
    where: {
      operatorTenantId: tenantId,
      OR: [{ nameNormalized: wanted }, { name: { equals: CT.clientLegalName, mode: "insensitive" } }],
    },
    select: { id: true, name: true },
  });
  return client;
}

async function seedPackages(tenantId: string, specs: PackageSpec[]): Promise<Map<string, string>> {
  const byScenario = new Map<string, string>();
  console.log("\n== Disposable packages ==");
  for (const s of specs) {
    const existing = await prisma.package.findFirst({ where: { tenantId, name: s.data.name }, select: { id: true } });
    if (existing) {
      byScenario.set(s.scenario, existing.id);
      line("EXISTS", s.data.name, s.note);
      continue;
    }
    if (APPLY) {
      const created = await PackagesService.createPackage(tenantId, s.data);
      byScenario.set(s.scenario, created.id);
      line("CREATED", s.data.name, s.note);
    } else {
      line("WOULD CREATE", s.data.name, s.note);
    }
  }
  return byScenario;
}

async function seedSchemes(tenantId: string, clientId: string | null, basePackageId: string | undefined, specs: SchemeSpec[]) {
  console.log("\n== Disposable schemes ==");
  if (!clientId) {
    line("FINDING", "Lakeview client not resolved", "cannot create disposable schemes under Lakeview — provision the signed client first (DEF-001)");
    return;
  }
  if (!basePackageId && APPLY) {
    line("FINDING", "S-BASE package id unavailable", "schemes need a package binding — S-BASE package must exist first");
    return;
  }
  for (const s of specs) {
    const name = lane(s.scenario);
    const existing = await prisma.group.findFirst({
      where: { tenantId, clientId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      line("EXISTS", name, `${s.note} (effective ${s.effectiveDate})`);
      continue;
    }
    if (APPLY && basePackageId) {
      await GroupsService.createGroup(
        tenantId,
        {
          name,
          registrationNumber: undefined,
          contactPersonName: s.contact.name,
          contactPersonPhone: s.contact.phone,
          contactPersonEmail: s.contact.email,
          packageId: basePackageId,
          effectiveDate: s.effectiveDate,
        },
        clientId,
      );
      line("CREATED", name, `${s.note} (effective ${s.effectiveDate})`);
    } else {
      line("WOULD CREATE", name, `${s.note} (effective ${s.effectiveDate}, binds S-BASE)`);
    }
  }
}

async function seedProvidersAndTariffs(tenantId: string, specs: ProviderSpec[]) {
  console.log("\n== Disposable providers + tariffs ==");
  for (const p of specs) {
    const providerName = lane(p.scenario);
    let provider = await prisma.provider.findFirst({ where: { tenantId, name: providerName }, select: { id: true } });
    if (provider) {
      line("EXISTS", providerName, p.note);
    } else if (APPLY) {
      const created = await ProvidersService.createProvider(tenantId, { ...p.data, name: providerName });
      provider = { id: created.id };
      line("CREATED", providerName, p.note);
    } else {
      line("WOULD CREATE", providerName, p.note);
    }

    for (const t of p.tariffs) {
      // Validate through the same schema the product action uses.
      const parsed = cptTariffSchema.safeParse({
        serviceName: t.serviceName,
        cptCode: null,
        agreedRate: t.agreedRate,
        currency: CT.currency,
        clientId: null,
        effectiveFrom: CT.policyStart,
        effectiveTo: null,
      });
      if (!parsed.success) {
        line("FINDING", `${providerName} · ${t.serviceName}`, `INVALID TARIFF: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
        continue;
      }
      const data = parsed.data;

      if (!provider) {
        line("WOULD CREATE", `${providerName} · ${t.serviceName}`, `${t.note} (rate ${t.agreedRate} ${CT.currency}) — awaits provider create`);
        continue;
      }

      const existingTariff = await prisma.providerTariff.findFirst({
        where: { providerId: provider.id, serviceName: t.serviceName, isActive: true },
        select: { id: true },
      });
      if (existingTariff) {
        line("EXISTS", `${providerName} · ${t.serviceName}`, `${t.note} (rate ${t.agreedRate} ${CT.currency})`);
        continue;
      }

      // Mirror WP-N2 overlap guard from upsertCptTariffAction.
      const active = await prisma.providerTariff.findMany({
        where: { providerId: provider.id, contractId: null, isActive: true, clientId: null },
        select: { id: true, cptCode: true, serviceName: true, clientId: true, contractId: true, effectiveFrom: true, effectiveTo: true, isActive: true },
      });
      const conflict = detectTariffOverlap(active, {
        cptCode: data.cptCode ?? null,
        serviceName: data.serviceName,
        clientId: null,
        contractId: null,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
      });
      if (conflict) {
        line("FINDING", `${providerName} · ${t.serviceName}`, "overlaps an existing active rate for the same scope — resolve before seeding");
        continue;
      }

      if (APPLY) {
        await prisma.providerTariff.create({
          data: {
            providerId: provider.id,
            cptCode: data.cptCode ?? null,
            serviceName: data.serviceName,
            agreedRate: data.agreedRate,
            currency: data.currency,
            clientId: null,
            effectiveFrom: data.effectiveFrom,
            effectiveTo: data.effectiveTo ?? null,
          },
        });
        line("CREATED", `${providerName} · ${t.serviceName}`, `${t.note} (rate ${t.agreedRate} ${CT.currency})`);
      } else {
        line("WOULD CREATE", `${providerName} · ${t.serviceName}`, `${t.note} (rate ${t.agreedRate} ${CT.currency})`);
      }
    }
  }
}

async function main() {
  console.log("Disposable UAT fixture lane — DEF-025 (plan §7.2)");
  console.log(`  mode:   ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}`);
  console.log(`  run id: ${RUN}${runId ? "" : "  (set UAT_RUN_ID for a concrete lane name)"}`);
  console.log(`  lane:   ${lane("<scenario>")}`);

  const packages = packageSpecs();
  const schemes = schemeSpecs();
  const providers = providerSpecs();

  // Always pre-validate the package baselines (pure, no DB).
  const baselinesOk = await validatePackages(packages);
  if (!baselinesOk) {
    console.log("\n!! One or more package baselines are invalid — fix the fixture spec before applying.");
    process.exitCode = 1;
  }

  if (!hasDb) {
    console.log("\n(DATABASE_URL not set — printing the intended plan only; set it to resolve targets, APPLY=1 to write.)");
    console.log("\n== Intended disposable schemes (bind S-BASE, under Lakeview client) ==");
    for (const s of schemes) line("WOULD CREATE", lane(s.scenario), `${s.note} (effective ${s.effectiveDate})`);
    console.log("\n== Intended disposable providers + tariffs ==");
    for (const p of providers) {
      line("WOULD CREATE", lane(p.scenario), p.note);
      for (const t of p.tariffs) line("WOULD CREATE", `${lane(p.scenario)} · ${t.serviceName}`, `${t.note} (rate ${t.agreedRate} ${CT.currency})`);
    }
    console.log("\nDRY-RUN complete (no database). Re-run with DATABASE_URL to resolve targets, APPLY=1 to write.");
    return;
  }

  const tenant = await resolveTenant();
  const client = await resolveLakeviewClient(tenant.id);
  console.log(`\n  tenant:  ${tenant.name} (${tenant.slug}) ${tenant.id}`);
  console.log(`  client:  ${client ? `${client.name} ${client.id}` : "Lakeview client NOT FOUND (finding — see DEF-001)"}`);

  const pkgIds = await seedPackages(tenant.id, packages);
  await seedSchemes(tenant.id, client?.id ?? null, pkgIds.get("S-BASE"), schemes);
  await seedProvidersAndTariffs(tenant.id, providers);

  console.log(
    APPLY
      ? "\nAPPLY complete: disposable lane provisioned (idempotent — existing records left untouched)."
      : "\nDRY-RUN complete. Re-run with APPLY=1 to write the WOULD-CREATE records above.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (hasDb) await prisma.$disconnect();
  });
