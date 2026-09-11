/**
 * Family Hospital UAT plan P01.02 — reviewed, idempotent tariff remediation.
 *
 * Resolves every group of Family tariff rows the contract engine cannot tell
 * apart (see scripts/lib/family-tariff-remediation-plan.ts for the rules). The
 * P01.01 preflight must pass afterwards; nothing here is ever deleted.
 *
 * Modes — the default is a DRY RUN that writes nothing:
 *
 *   dry run   DATABASE_URL=<url> npx tsx scripts/family-hospital-tariff-remediation.ts \
 *               --batch-ref FH-P0102-<yyyymmdd> [--out <dir>]
 *             Prints the manifest and its SHA-256. A reviewer approves THAT hash.
 *
 *   apply     … --apply --batch-ref <ref> --manifest-hash <sha> --operator-user-id <id>
 *             Recomputes the plan inside one transaction; refuses unless it hashes
 *             to the approved manifest. A rerun with the same batch ref is a
 *             replay that writes nothing.
 *
 *   rollback  … --rollback --batch-ref <ref> --operator-user-id <id>
 *             Deactivates the batch's replacements and reactivates exactly the
 *             rows the batch deactivated.
 *
 * Scope: the reviewed Family IDs (scripts/lib/family-hospital-reviewed.ts), or —
 * for the disposable-database rehearsal — ALL of --tenant-id, --provider-id,
 * --branch-id and --contract-id.
 *
 * Exit codes: 0 success · 2 plan not applicable (unresolved groups / refused) · 1 error.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { operatingTodayISO } from "@/lib/service-date";
import { FAMILY_REVIEWED, type FamilyScope } from "./lib/family-hospital-reviewed";
import { applyRemediation, planForScope, RemediationError, rollbackRemediation } from "./lib/family-tariff-remediation-apply";
import type { RemediationManifest } from "./lib/family-tariff-remediation-plan";

// Same runtime timezone as production and as the engine (see the preflight).
process.env.TZ = "UTC";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(`--${flag}`);

function scopeFromArgs(): FamilyScope {
  const o = { tenantId: arg("tenant-id"), providerId: arg("provider-id"), branchId: arg("branch-id"), contractId: arg("contract-id") };
  const given = Object.values(o).filter(Boolean).length;
  if (given === 0) {
    return { tenantId: FAMILY_REVIEWED.tenantId, providerId: FAMILY_REVIEWED.providerId, branchId: FAMILY_REVIEWED.branchId, contractId: FAMILY_REVIEWED.contractId };
  }
  if (given !== 4) throw new Error("Override all of --tenant-id, --provider-id, --branch-id and --contract-id, or none.");
  return o as FamilyScope;
}

function renderManifest(m: RemediationManifest): string {
  const out: string[] = [];
  out.push(`# P01.02 — Family tariff remediation manifest (${m.batchRef})`);
  out.push("");
  out.push(`Manifest SHA-256: \`${m.manifestHash}\` — the value a reviewer approves and \`--apply --manifest-hash\` must quote.`);
  out.push("");
  out.push(`Contract \`${m.contractId}\` · currency **${m.currency}** · tax-inclusive **${m.taxInclusive}** (rates are carried unchanged; tax-inclusive per the facility).`);
  out.push("");
  out.push(`| Totals | |`);
  out.push(`|---|---|`);
  for (const [k, v] of Object.entries(m.totals)) out.push(`| ${k} | ${v} |`);
  for (const [k, v] of Object.entries(m.postStateCheck)) out.push(`| after: ${k} | ${v} |`);
  out.push("");
  const byDisposition = new Map<string, number>();
  for (const g of m.groups) byDisposition.set(g.disposition, (byDisposition.get(g.disposition) ?? 0) + 1);
  out.push(`Groups by disposition: ${[...byDisposition.entries()].map(([d, n]) => `${d} ${n}`).join(" · ")}`);
  out.push("");
  m.groups.forEach((g, i) => {
    out.push(`## ${i + 1}. ${g.disposition} — "${g.key}"`);
    out.push("");
    out.push(g.reason);
    out.push("");
    out.push(`| Row | Service name (as loaded) | Rate (${m.currency}) | Unit | Category id | Source fingerprint | Action |`);
    out.push(`|---|---|---|---|---|---|---|`);
    for (const r of g.rows) {
      const action = g.keepIds.includes(r.id) ? "keep" : g.deactivateIds.includes(r.id) ? "deactivate" : "—";
      out.push(`| \`${r.id}\` | ${r.serviceName} | ${r.agreedRate} | ${r.unit ?? "—"} | \`${r.categoryId ?? "—"}\` | \`${r.sourceFingerprint.slice(0, 16)}…\` | ${action} |`);
    }
    if (g.replacements.length) {
      out.push("");
      out.push(`Replacements (same rate, currency, category, unit and effective dates as the row they supersede):`);
      out.push("");
      for (const rep of g.replacements) out.push(`- \`${rep.supersedesId}\` → **${rep.serviceName}** (fingerprint \`${rep.fingerprint.slice(0, 16)}…\`)`);
    }
    out.push("");
  });
  return out.join("\n");
}

async function main(): Promise<number> {
  const scope = scopeFromArgs();
  const batchRef = arg("batch-ref");
  if (!batchRef || !/^[A-Za-z0-9._:-]{8,64}$/.test(batchRef)) {
    throw new Error("--batch-ref is required (8–64 of letters, digits, . _ : -), e.g. FH-P0102-20260911.");
  }
  const pricingDate = new Date(`${arg("today") ?? operatingTodayISO()}T00:00:00Z`);

  if (has("apply") && has("rollback")) throw new Error("Choose one of --apply or --rollback.");

  if (has("rollback")) {
    const operatorUserId = arg("operator-user-id");
    if (!operatorUserId) throw new Error("--operator-user-id is required for --rollback.");
    const r = await rollbackRemediation(prisma, { scope, batchRef, operatorUserId });
    console.log(JSON.stringify(r, null, 2));
    return 0;
  }

  if (has("apply")) {
    const operatorUserId = arg("operator-user-id");
    const expectedManifestHash = arg("manifest-hash");
    if (!operatorUserId || !expectedManifestHash) throw new Error("--apply needs --operator-user-id and --manifest-hash (from the reviewed dry run).");
    const r = await applyRemediation(prisma, { scope, batchRef, expectedManifestHash, operatorUserId, pricingDate });
    console.log(JSON.stringify(r, null, 2));
    return 0;
  }

  // Dry run — read-only transaction.
  const manifest = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return planForScope(tx, scope, batchRef, pricingDate);
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  const markdown = renderManifest(manifest);
  const out = arg("out");
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `P01.02-manifest-${batchRef}.md`), markdown + "\n");
    writeFileSync(join(out, `P01.02-manifest-${batchRef}.json`), JSON.stringify(manifest, null, 2) + "\n");
    console.error(`wrote ${join(out, `P01.02-manifest-${batchRef}.{md,json}`)}`);
  }
  console.log(has("json") ? JSON.stringify(manifest, null, 2) : markdown);
  return manifest.totals.unresolvedGroups === 0 ? 0 : 2;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    const code = err instanceof RemediationError ? 2 : 1;
    console.error(`remediation ${code === 2 ? "refused" : "failed"}:`, err instanceof Error ? `${(err as RemediationError).code ?? ""} ${err.message}` : err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(code);
  });
