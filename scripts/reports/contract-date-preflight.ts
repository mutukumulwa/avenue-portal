/**
 * UAT-HF P02.03 — read-only report of contracts whose stored dates the UI
 * cannot render.
 *
 * DEF-050 (S1): one such row made `/contracts` and `/contracts/{id}` throw for
 * every persona on every load, and `/contracts/{id}/edit` returned Page Not
 * Found — so the module was dead until someone edited the database directly.
 *
 * P02.01 stops new ones being written. P02.02 stops existing ones crashing the
 * register. This report is how you find the ones already there, and it is the
 * "dry-run report to zero" the plan requires **before** and **after** the
 * governed repair.
 *
 * It writes nothing and has no `--apply`, deliberately (plan rule §2.9). A
 * contract term is a signed agreement; correcting one goes through the
 * maker/checker repair in `ContractLifecycleService.requestDateRepair`, not a
 * script.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx scripts/reports/contract-date-preflight.ts
 *   DATABASE_URL=<url> npx tsx scripts/reports/contract-date-preflight.ts --json
 *
 * Exit code is 0 when clean and 2 when damaged rows exist, so it can gate a
 * release check.
 */
import { prisma } from "@/lib/prisma";
import { calendarDateFromUtcDate } from "@/lib/calendar-date";
import { isRenderableContractDate } from "@/lib/validation/provider-contract";

/** How a stored value looks when it cannot be rendered. */
function describe(value: Date | null): string {
  if (value == null) return "—";
  if (Number.isNaN(value.getTime())) return "INVALID DATE";
  const day = calendarDateFromUtcDate(value);
  if (day) return day;
  // Year outside 1900..9999 — the DEF-050 shape. Report the raw year, which is
  // the single most useful fact for judging what the value was meant to be.
  return `year ${value.getUTCFullYear()}`;
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");

  const contracts = await prisma.providerContract.findMany({
    select: {
      id: true,
      contractNumber: true,
      status: true,
      startDate: true,
      endDate: true,
      reviewDueDate: true,
      createdAt: true,
      provider: { select: { name: true } },
      _count: { select: { tariffLines: true, applicability: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const damaged = contracts
    .map((c) => {
      const fields: string[] = [];
      if (!isRenderableContractDate(c.startDate)) fields.push("startDate");
      if (!isRenderableContractDate(c.endDate)) fields.push("endDate");
      if (!isRenderableContractDate(c.reviewDueDate)) fields.push("reviewDueDate");
      return { c, fields };
    })
    .filter((r) => r.fields.length > 0);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          examined: contracts.length,
          damaged: damaged.map(({ c, fields }) => ({
            contractId: c.id,
            contractNumber: c.contractNumber,
            status: c.status,
            provider: c.provider.name,
            unrenderableFields: fields,
            startDate: describe(c.startDate),
            endDate: describe(c.endDate),
            reviewDueDate: describe(c.reviewDueDate),
            dependentTariffLines: c._count.tariffLines,
            dependentApplicability: c._count.applicability,
          })),
        },
        null,
        2,
      ),
    );
    process.exitCode = damaged.length > 0 ? 2 : 0;
    return;
  }

  console.log("── Provider-contract date preflight (DEF-050) ─────────────────");
  console.log(`Contracts examined: ${contracts.length}`);

  if (damaged.length === 0) {
    console.log("\nNo unrenderable contract dates. The register cannot be taken down by stored data.");
    return;
  }

  console.log(`\n${damaged.length} contract(s) carry a date the UI cannot render:\n`);
  for (const { c, fields } of damaged) {
    console.log(`  ${c.contractNumber}  (${c.status})  — ${c.provider.name}`);
    console.log(`    id:            ${c.id}`);
    console.log(`    unrenderable:  ${fields.join(", ")}`);
    console.log(`    start / end:   ${describe(c.startDate)}  →  ${describe(c.endDate)}`);
    console.log(`    review due:    ${describe(c.reviewDueDate)}`);
    // Dependents matter because the repair must PRESERVE them — the run's row
    // was deleted only after verifying it had none.
    console.log(`    dependents:    ${c._count.tariffLines} tariff line(s), ${c._count.applicability} applicability row(s)`);
    console.log("");
  }

  console.log(
    "Repair these through the governed path, never by hand:\n" +
      "  1. On the contract, propose the corrected term with a reason and a source document.\n" +
      "  2. A DIFFERENT authorised user approves it on the Overrides console.\n" +
      "  3. Apply the approved repair; the contract is corrected, never deleted, and its\n" +
      "     tariffs, applicability and versions are untouched.\n" +
      "Then re-run this report — it must reach zero.",
  );
  process.exitCode = 2;
}

main()
  .catch((err) => {
    console.error("[contract-date-preflight] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
