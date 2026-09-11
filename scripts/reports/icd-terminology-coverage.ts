/**
 * Family Hospital UAT plan P04.05 / FH-14 — read-only ICD-10 terminology report.
 *
 * "Add a read-only report with deployed ICD row count, source/version metadata,
 * active/inactive state, representative code coverage, and duplicates … Do not
 * claim complete ICD-10 coverage without source/version evidence."
 *
 * DEC-FH-03 (owner, 2026-09-11): no approved ICD-10 release exists yet, so this
 * report is the whole of P04.05 — there is no import. It measures what is
 * deployed and says plainly what cannot be claimed.
 *
 * READ-ONLY by construction: every query runs in one transaction opened with
 * `SET TRANSACTION READ ONLY`. There is no write path.
 *
 * The representative set below is the EXECUTOR's illustrative choice of common
 * primary-care and hospital presentations in Uganda (it includes the plan's own
 * example, B54). It is not an approved clinical reference list; it shows whether
 * the deployed catalogue can serve an ordinary facility day, by exact code and by
 * three-character category.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx scripts/reports/icd-terminology-coverage.ts [--out <dir>] [--json]
 *
 * Exit codes: 0 = report produced (the verdict is in the report) · 1 = the report failed.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

const REPRESENTATIVE: ReadonlyArray<{ code: string; label: string }> = [
  { code: "B54", label: "Malaria, unspecified" },
  { code: "B50.9", label: "Plasmodium falciparum malaria, unspecified" },
  { code: "A09", label: "Infectious gastroenteritis / diarrhoea" },
  { code: "A01.0", label: "Typhoid fever" },
  { code: "J06.9", label: "Acute upper respiratory infection, unspecified" },
  { code: "J18.9", label: "Pneumonia, unspecified" },
  { code: "N39.0", label: "Urinary tract infection, site not specified" },
  { code: "K29.7", label: "Gastritis, unspecified" },
  { code: "I10", label: "Essential (primary) hypertension" },
  { code: "E11.9", label: "Type 2 diabetes mellitus without complications" },
  { code: "B20", label: "HIV disease" },
  { code: "A15.0", label: "Tuberculosis of lung" },
  { code: "D50.9", label: "Iron deficiency anaemia, unspecified" },
  { code: "R50.9", label: "Fever, unspecified" },
  { code: "Z34.9", label: "Supervision of normal pregnancy, unspecified" },
  { code: "O80", label: "Single spontaneous delivery" },
  { code: "O82", label: "Delivery by caesarean section" },
  { code: "K35.8", label: "Acute appendicitis, other and unspecified" },
  { code: "L03.9", label: "Cellulitis, unspecified" },
  { code: "H10.9", label: "Conjunctivitis, unspecified" },
  { code: "K02.9", label: "Dental caries, unspecified" },
  { code: "M54.5", label: "Low back pain" },
];

/** Columns that would carry provenance or lifecycle, if the table had any. */
const METADATA_COLUMNS = ["source", "sourceVersion", "version", "release", "edition", "isActive", "active", "status", "validFrom", "validTo", "deprecatedAt"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** The codes the repository's demo seed writes (prisma/seed.ts `icdCodes`). */
function repositorySeedCodes(): string[] {
  const src = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");
  const start = src.indexOf("const icdCodes = [");
  const end = src.indexOf("for (const c of icdCodes)", start);
  if (start < 0 || end < 0) return [];
  return [...src.slice(start, end).matchAll(/code:\s*'([^']+)'/g)].map((m) => m[1].trim().toUpperCase());
}

const category3 = (code: string) => code.trim().toUpperCase().slice(0, 3);

async function main(): Promise<number> {
  const data = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const columns = await tx.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'ICD10Code' ORDER BY ordinal_position`,
      );
      const rows = await tx.iCD10Code.findMany({ select: { code: true, description: true, category: true, chapterCode: true, standardCharge: true }, orderBy: { code: "asc" } });
      return { columns: columns.map((c) => c.column_name), rows };
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  const { columns, rows } = data;
  const codes = rows.map((r) => r.code);
  const byCode = new Map(rows.map((r) => [r.code.trim().toUpperCase(), r]));
  const categories3 = new Set(codes.map(category3));

  // Duplicates: a code differing only in case/whitespace, and one description under several codes.
  const normalizedCodeGroups = new Map<string, string[]>();
  for (const c of codes) {
    const k = c.trim().toUpperCase();
    normalizedCodeGroups.set(k, [...(normalizedCodeGroups.get(k) ?? []), c]);
  }
  const codeCollisions = [...normalizedCodeGroups.values()].filter((g) => g.length > 1);
  const descGroups = new Map<string, string[]>();
  for (const r of rows) {
    const k = r.description.trim().toLowerCase().replace(/\s+/g, " ");
    descGroups.set(k, [...(descGroups.get(k) ?? []), r.code]);
  }
  const duplicateDescriptions = [...descGroups.entries()].filter(([, g]) => g.length > 1).map(([description, group]) => ({ description, codes: group }));

  const categoryCounts = new Map<string, number>();
  for (const r of rows) categoryCounts.set(r.category, (categoryCounts.get(r.category) ?? 0) + 1);

  const seed = repositorySeedCodes();
  const seedSet = new Set(seed);
  const deployedInSeed = codes.filter((c) => seedSet.has(c.trim().toUpperCase())).length;
  const deployedNotInSeed = codes.filter((c) => !seedSet.has(c.trim().toUpperCase()));
  const seedNotDeployed = seed.filter((c) => !byCode.has(c));

  const representative = REPRESENTATIVE.map((r) => {
    const hit = byCode.get(r.code);
    return {
      code: r.code,
      label: r.label,
      exact: !!hit,
      catalogueDescription: hit?.description ?? null,
      sameCategory: categories3.has(category3(r.code)),
    };
  });
  const exactCount = representative.filter((r) => r.exact).length;
  const categoryCount = representative.filter((r) => r.sameCategory).length;

  const metadataPresent = METADATA_COLUMNS.filter((c) => columns.includes(c));
  const verdict =
    metadataPresent.length === 0
      ? `NOT COMPLETE — ${rows.length} codes deployed with no source or version metadata. Complete ICD-10 coverage must not be claimed.`
      : `${rows.length} codes deployed; metadata columns present: ${metadataPresent.join(", ")}.`;

  const json = {
    kind: "FH_P04_05_ICD_COVERAGE",
    generatedAt: new Date().toISOString(),
    verdict,
    totals: {
      rows: rows.length,
      distinctThreeCharacterCategories: categories3.size,
      withStandardCharge: rows.filter((r) => r.standardCharge !== null).length,
      withoutChapterCode: rows.filter((r) => !r.chapterCode).length,
    },
    metadata: { columns, provenanceOrLifecycleColumns: metadataPresent, activeState: metadataPresent.some((c) => ["isActive", "active", "status"].includes(c)) ? "column present" : "no active/inactive column — every row is live" },
    repositorySeed: { seedCodes: seed.length, deployedInSeed, deployedNotInSeed, seedNotDeployed },
    representative: { total: representative.length, exact: exactCount, sameCategory: categoryCount, rows: representative },
    duplicates: { codeCollisions, duplicateDescriptions },
    categories: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
  };

  const md = [
    "# P04.05 — ICD-10 terminology coverage (read-only)",
    "",
    `Generated ${json.generatedAt} by \`scripts/reports/icd-terminology-coverage.ts\` inside one READ ONLY transaction.`,
    "",
    `**Verdict:** ${verdict}`,
    "",
    "## Totals",
    "",
    "| Measure | Value |",
    "|---|---|",
    `| Rows in \`ICD10Code\` | ${json.totals.rows} |`,
    `| Distinct three-character categories | ${json.totals.distinctThreeCharacterCategories} |`,
    `| Rows carrying \`standardCharge\` (never read by the provider search) | ${json.totals.withStandardCharge} |`,
    `| Rows without a chapter code | ${json.totals.withoutChapterCode} |`,
    "",
    "## Source, version and active state",
    "",
    `Columns: ${columns.map((c) => `\`${c}\``).join(", ")}.`,
    "",
    metadataPresent.length === 0
      ? "The table has **no source, release, version or active/inactive column**, so the deployed rows carry no evidence of which ICD-10 edition they come from, and every row is live. DEC-FH-03: no approved release exists to load."
      : `Provenance/lifecycle columns present: ${metadataPresent.join(", ")}.`,
    "",
    "## Comparison with the repository demo seed (`prisma/seed.ts`)",
    "",
    `The seed writes ${seed.length} codes. Deployed codes found in the seed: **${deployedInSeed} of ${rows.length}**. Deployed codes not in the seed: ${deployedNotInSeed.length ? deployedNotInSeed.join(", ") : "none"}. Seed codes not deployed: ${seedNotDeployed.length ? seedNotDeployed.join(", ") : "none"}.`,
    "",
    "## Representative coverage",
    "",
    `Exact code present for **${exactCount} of ${representative.length}**; a code in the same three-character category for **${categoryCount} of ${representative.length}**. (Executor's illustrative set — see the script header.)`,
    "",
    "| Code | Condition | Exact code deployed | Same 3-character category deployed |",
    "|---|---|---|---|",
    ...representative.map((r) => `| ${r.code} | ${r.label} | ${r.exact ? "yes" : "**no**"} | ${r.sameCategory ? "yes" : "**no**"} |`),
    "",
    "## Duplicates",
    "",
    `Codes differing only by case or whitespace: ${codeCollisions.length ? codeCollisions.map((g) => g.join(" / ")).join("; ") : "none"}.`,
    "",
    duplicateDescriptions.length
      ? ["One description under several codes:", "", ...duplicateDescriptions.map((d) => `- ${d.codes.join(", ")} — "${d.description}"`)].join("\n")
      : "No description appears under more than one code.",
    "",
    "## Categories",
    "",
    "| Category | Codes |",
    "|---|---|",
    ...json.categories.map((c) => `| ${c.category} | ${c.count} |`),
    "",
  ].join("\n");

  const out = arg("out");
  if (out) {
    mkdirSync(out, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(out, `P04.05-icd-coverage-${stamp}.md`), md);
    writeFileSync(join(out, `P04.05-icd-coverage-${stamp}.json`), JSON.stringify(json, null, 2) + "\n");
    console.error(`wrote ${join(out, `P04.05-icd-coverage-${stamp}.{md,json}`)}`);
  }
  console.log(process.argv.includes("--json") ? JSON.stringify(json, null, 2) : md);
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("ICD coverage report failed:", err instanceof Error ? err.message : err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
