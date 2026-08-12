/**
 * UAT-HF P02.04 — read-only preflight for provider-contract currencies.
 *
 * DEF-052: contract creation defaulted to a literal "KES" on a Uganda
 * deployment — in the form, the action, the import path AND the schema default.
 * Those four copies are now fixed, but **existing rows are untouched**, and this
 * report is the thing that must run before anyone considers changing them.
 *
 * The distinction it exists to draw, because they are indistinguishable in the
 * data alone:
 *
 *   MISTAKEN   a KES contract with a Ugandan provider and UGX-denominated
 *              tariffs — the wrong default, silently inherited
 *   LEGITIMATE a genuinely KES-denominated cross-border agreement
 *
 * Plan rule §2.9 is explicit: never add a constraint or backfill before running
 * and archiving a read-only collision report. So this script **writes nothing**.
 * It has no `--apply`, deliberately. Reclassification is P12.02, after a named
 * owner has signed the output.
 *
 * Usage (read-only; safe against any environment):
 *   DATABASE_URL=<url> npx tsx scripts/reports/contract-currency-preflight.ts
 *   DATABASE_URL=<url> npx tsx scripts/reports/contract-currency-preflight.ts --json
 */
import { prisma } from "@/lib/prisma";
import { CURRENCY_CODE } from "@/lib/locale-config";

interface ContractCurrencyRow {
  contractNumber: string;
  contractId: string;
  status: string;
  currency: string;
  providerName: string;
  providerCountryHint: string | null;
  tariffCount: number;
  createdAt: Date;
  /** Why this row looks the way it does — the judgement a human must confirm. */
  assessment: "LOOKS_MISTAKEN" | "POSSIBLY_LEGITIMATE" | "BASE_CURRENCY";
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");

  const contracts = await prisma.providerContract.findMany({
    select: {
      id: true,
      contractNumber: true,
      status: true,
      currency: true,
      createdAt: true,
      provider: { select: { name: true, county: true, address: true } },
      _count: { select: { tariffLines: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: ContractCurrencyRow[] = contracts.map((c) => {
    const currency = (c.currency ?? "").toUpperCase();
    // A provider location is the only signal available here, and it is weak —
    // which is exactly why this report asks a human rather than deciding.
    // `county` is the Kenyan taxonomy the product still uses for a provider's
    // location (DEF-049; P11.03 renames it to District). Whatever it is called,
    // it is the only location signal available here.
    const locationHint = [c.provider.county, c.provider.address].filter(Boolean).join(", ") || null;
    const assessment: ContractCurrencyRow["assessment"] =
      currency === CURRENCY_CODE
        ? "BASE_CURRENCY"
        : /nairobi|kenya|mombasa|kisumu/i.test(locationHint ?? "")
          ? "POSSIBLY_LEGITIMATE"
          : "LOOKS_MISTAKEN";

    return {
      contractNumber: c.contractNumber,
      contractId: c.id,
      status: c.status,
      currency,
      providerName: c.provider.name,
      providerCountryHint: locationHint,
      tariffCount: c._count.tariffLines,
      createdAt: c.createdAt,
      assessment,
    };
  });

  const nonBase = rows.filter((r) => r.assessment !== "BASE_CURRENCY");

  if (asJson) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), base: CURRENCY_CODE, rows }, null, 2));
    return;
  }

  const byCurrency = new Map<string, number>();
  for (const r of rows) byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + 1);

  console.log("── Provider-contract currency preflight (DEF-052) ─────────────");
  console.log(`Platform base currency: ${CURRENCY_CODE}`);
  console.log(`Contracts examined:     ${rows.length}`);
  console.log("");
  console.log("By currency:");
  for (const [code, count] of [...byCurrency].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(5)} ${String(count).padStart(5)}`);
  }

  if (nonBase.length === 0) {
    console.log("\nNo non-base-currency contracts. Nothing to reclassify.");
    return;
  }

  console.log(`\n${nonBase.length} contract(s) are not in the base currency:\n`);
  console.log(
    ["ASSESSMENT", "CONTRACT", "CCY", "STATUS", "TARIFFS", "PROVIDER", "LOCATION"]
      .map((h, i) => h.padEnd([20, 16, 5, 12, 8, 32, 24][i]))
      .join(""),
  );
  for (const r of nonBase) {
    console.log(
      [
        r.assessment.padEnd(20),
        r.contractNumber.padEnd(16),
        r.currency.padEnd(5),
        r.status.padEnd(12),
        String(r.tariffCount).padEnd(8),
        r.providerName.slice(0, 30).padEnd(32),
        (r.providerCountryHint ?? "—").slice(0, 22).padEnd(24),
      ].join(""),
    );
  }

  console.log(
    "\nThis report WRITES NOTHING and has no --apply, by design (plan rule 2.9).\n" +
      "LOOKS_MISTAKEN rows are candidates for reclassification; POSSIBLY_LEGITIMATE\n" +
      "rows may be genuine cross-border agreements. A named business owner must sign\n" +
      "the classification before P12.02 backfills anything — a contract silently\n" +
      "redenominated is a priced agreement changed without agreement.",
  );
}

main()
  .catch((err) => {
    console.error("[contract-currency-preflight] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
