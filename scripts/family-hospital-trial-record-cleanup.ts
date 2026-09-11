/**
 * Family Hospital UAT plan P07.01 — withdraw the four trial claims and cancel the
 * trial pre-authorisation that were priced from the global CPT reference table
 * (P00.03), with reason TEST_DATA_INCORRECT_TARIFF (DEC-FH-04). Nothing is
 * deleted; see scripts/lib/family-trial-record-cleanup.ts for the rules.
 *
 * Modes — the default is a DRY RUN that writes nothing:
 *
 *   dry run   DATABASE_URL=<url> npx tsx scripts/family-hospital-trial-record-cleanup.ts [--out <dir>]
 *             Reconciles the reviewed record set with the database and prints
 *             what --apply would do, or why it would refuse.
 *
 *   apply     … --apply --batch-ref FH-P0701-<yyyymmdd> --operator-user-id <id>
 *             Needs the owner's approval for a production database. A rerun
 *             with the same batch ref replays without writing.
 *
 * Scope: the reviewed Family ids (scripts/lib/family-hospital-reviewed.ts), or —
 * for a disposable-database rehearsal — `--scope-file <json>` holding
 * { tenantId, providerId, claims: [{id, number}], preauths: [{id, number}] }.
 *
 * Output: a JSON and a Markdown record under --out (default
 * docs/provider-onboarding/evidence). Record ids, numbers and statuses only —
 * no member, patient or diagnosis detail.
 *
 * Exit codes: 0 success · 2 refused (drift, operator, receipt state) · 1 error.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { FAMILY_P0003_SUSPECT, FAMILY_REVIEWED, type SuspectRecordSet } from "./lib/family-hospital-reviewed";
import { applyCleanup, CleanupRefused, CLEANUP_REASON, inspect, type CleanupResult, type CleanupScope, type Inspection } from "./lib/family-trial-record-cleanup";

process.env.TZ = "UTC";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(`--${flag}`);

function scopeFromArgs(): { scope: CleanupScope; suspect: SuspectRecordSet } {
  const file = arg("scope-file");
  if (!file) {
    return { scope: { tenantId: FAMILY_REVIEWED.tenantId, providerId: FAMILY_REVIEWED.providerId }, suspect: FAMILY_P0003_SUSPECT };
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as CleanupScope & SuspectRecordSet;
  if (!raw.tenantId || !raw.providerId || !Array.isArray(raw.claims) || !Array.isArray(raw.preauths)) {
    throw new Error("--scope-file needs { tenantId, providerId, claims: [{id, number}], preauths: [{id, number}] }.");
  }
  return { scope: { tenantId: raw.tenantId, providerId: raw.providerId }, suspect: { claims: raw.claims, preauths: raw.preauths } };
}

function renderInspection(title: string, i: Inspection): string[] {
  const out = [`### ${title}`, "", "| Record | Id | Status | Action |", "|---|---|---|---|"];
  for (const r of [...i.claims, ...i.preauths]) out.push(`| ${r.number} | \`${r.id}\` | ${r.status ?? "—"} | ${r.action}${r.blocker ? ` — ${r.blocker}` : ""} |`);
  out.push("");
  out.push(i.unexpected.length === 0
    ? "No other claim or pre-authorisation exists for this provider."
    : `Other records for this provider (not in the reviewed set): ${i.unexpected.map((u) => `${u.number} (${u.status})`).join(", ")}.`);
  out.push("");
  return out;
}

function render(mode: string, scope: CleanupScope, inspection: Inspection, result?: CleanupResult): string {
  const out = [
    `# P07.01 — Family trial-record cleanup (${mode})`,
    "",
    `Provider \`${scope.providerId}\` · tenant \`${scope.tenantId}\` · reason \`${CLEANUP_REASON}\``,
    "",
    "Restricted: production record ids and statuses. No member, patient or diagnosis detail.",
    "",
  ];
  if (!result) {
    out.push(...renderInspection("Reconciliation", inspection));
    out.push(inspection.refusals.length === 0 ? "**--apply would proceed.**" : `**--apply would refuse:**\n\n${inspection.refusals.map((r) => `- ${r}`).join("\n")}`);
    return out.join("\n") + "\n";
  }
  out.push(`Outcome **${result.outcome}** · operation receipt \`${result.operationId}\` · batch \`${result.batchRef}\` · operator \`${result.operatorUserId}\``, "");
  out.push(...renderInspection("Before", result.before));
  out.push("### Steps", "", "| Record | From | To | Effect |", "|---|---|---|---|");
  for (const s of result.steps) out.push(`| ${s.number} | ${s.fromStatus ?? "—"} | ${s.toStatus} | ${s.effect} |`);
  out.push("");
  out.push(...renderInspection("After", result.after));
  out.push("### Audit and lifecycle rows", "");
  for (const a of result.auditEvents) out.push(`- audit \`${a.id}\` ${a.action} on \`${a.entityId}\` by \`${a.userId}\` at ${a.createdAt.toISOString()}`);
  for (const l of result.lifecycleLogs) out.push(`- lifecycle log \`${l.id}\` WITHDRAWN on \`${l.claimId}\` by \`${l.userId}\` at ${l.createdAt.toISOString()}`);
  return out.join("\n") + "\n";
}

async function main(): Promise<number> {
  const { scope, suspect } = scopeFromArgs();
  const outDir = arg("out") ?? join(process.cwd(), "docs/provider-onboarding/evidence");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (!has("apply")) {
    const inspection = await inspect(prisma, scope, suspect);
    mkdirSync(outDir, { recursive: true });
    const base = join(outDir, `P07.01-dry-run-${stamp}`);
    writeFileSync(`${base}.json`, JSON.stringify({ mode: "dry-run", scope, reason: CLEANUP_REASON, inspection }, null, 2));
    writeFileSync(`${base}.md`, render("dry run", scope, inspection));
    console.log(render("dry run", scope, inspection));
    console.log(`Written: ${base}.{json,md}`);
    return inspection.refusals.length === 0 ? 0 : 2;
  }

  const batchRef = arg("batch-ref");
  const operatorUserId = arg("operator-user-id");
  if (!batchRef || !/^[A-Za-z0-9._:-]{8,64}$/.test(batchRef)) throw new Error("--batch-ref is required (8–64 of letters, digits, . _ : -), e.g. FH-P0701-20260911.");
  if (!operatorUserId) throw new Error("--operator-user-id is required for --apply.");

  const result = await applyCleanup(prisma, { scope, suspect, batchRef, operatorUserId });
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `P07.01-${result.outcome.toLowerCase()}-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify({ mode: "apply", scope, ...result }, null, 2));
  writeFileSync(`${base}.md`, render(result.outcome.toLowerCase(), scope, result.before, result));
  console.log(render(result.outcome.toLowerCase(), scope, result.before, result));
  console.log(`Written: ${base}.{json,md}`);
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    await prisma.$disconnect().catch(() => undefined);
    if (err instanceof CleanupRefused) {
      console.error(`REFUSED (${err.code}): ${err.message}`);
      process.exit(2);
    }
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
