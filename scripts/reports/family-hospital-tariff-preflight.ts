/**
 * Family Hospital UAT plan P01.01 — read-only Family tariff / contract preflight.
 *
 * Proves, from the database alone, whether Family Healthcare's tariff can be
 * shown to its staff: that the rows exist in exactly the scope the contract
 * engine prices from, in UGX, with no row the engine could confuse with another.
 * P02 (provider tariff search) must not be enabled for the facility until this
 * report exits 0 against the target database.
 *
 * READ-ONLY by construction. Every query this script issues itself runs inside
 * one transaction opened with `SET TRANSACTION READ ONLY`, so an accidental write
 * is refused by Postgres. The one exception is the engine's own contract
 * pre-check (`ContractLifecycleService.precheck`), which is called as-is because
 * reusing the engine's code is the point; it issues only `findMany`. There is no
 * `--apply` and there must never be one (plan P01.01) — repairs are P01.02.
 *
 * IDs are the reviewed exact values below, never a name search. Override with
 * flags only for a different reviewed facility.
 *
 * Usage:
 *   DATABASE_URL=<url> npx tsx scripts/reports/family-hospital-tariff-preflight.ts \
 *     [--out <dir>] [--expected-logical <n>] [--today YYYY-MM-DD] [--json]
 *
 * Exit codes: 0 = every hard gate passes · 2 = at least one release blocker ·
 * 1 = the report itself failed.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";
import {
  loadCandidateTariffs,
  normalizeServiceText,
  pricingTermsKey,
  TariffResolutionIndex,
} from "@/server/services/contract-engine/tariff-selection";
import { lineCategoryForTaxonomy, taxonomyChain } from "@/lib/claim-line-category";
import { operatingTodayISO } from "@/lib/service-date";
import type { Prisma, ProviderTariff } from "@prisma/client";
import { FAMILY_REVIEWED } from "../lib/family-hospital-reviewed";
import { REMEDIATION_KIND } from "../lib/family-tariff-remediation-plan";

// The engine computes day bounds in the runtime's local timezone and production
// (Vercel) runs in UTC. Evaluate exactly what production evaluates.
process.env.TZ = "UTC";

/**
 * The reviewed production IDs, unless EVERY scope id is overridden explicitly
 * (the disposable-database rehearsal of P01.02). A partial override is refused:
 * mixing a production provider with a test contract is exactly the kind of
 * fuzzy resolution plan P01.01 forbids.
 */
const REVIEWED = (() => {
  const overrides = {
    tenantId: argValue("tenant-id"),
    providerId: argValue("provider-id"),
    branchId: argValue("branch-id"),
    contractId: argValue("contract-id"),
  };
  const given = Object.values(overrides).filter(Boolean).length;
  if (given === 0) return { ...FAMILY_REVIEWED };
  if (given !== 4) throw new Error("Override all of --tenant-id, --provider-id, --branch-id and --contract-id, or none.");
  const expected = argValue("expected-source-rows");
  return {
    ...FAMILY_REVIEWED,
    ...(overrides as { tenantId: string; providerId: string; branchId: string; contractId: string }),
    expectedSourceRows: expected ? Number.parseInt(expected, 10) : FAMILY_REVIEWED.expectedSourceRows,
  };
})();

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type TariffRow = Pick<
  ProviderTariff,
  | "id" | "contractId" | "versionId" | "branchId" | "clientId" | "cptCode" | "providerServiceCode" | "serviceName"
  | "standardDescription" | "providerDescription" | "agreedRate" | "currency" | "tariffType" | "rateType"
  | "discountPct" | "markupPct" | "minPayableAmount" | "maxPayableAmount" | "quantityLimit" | "maxQuantityPerVisit"
  | "requiresPreauth" | "requiresReferral" | "rateMissing" | "externalScheme" | "externalRebateAmount"
  | "serviceCategoryId" | "unitOfMeasure" | "effectiveFrom" | "effectiveTo" | "isActive" | "notes" | "sourceRef"
>;

/** Replacement rows written by P01.02 carry `REMEDIATION_KIND` in `sourceRef.kind`. */
function isRemediationRow(t: Pick<ProviderTariff, "sourceRef">): boolean {
  const ref = t.sourceRef as { kind?: unknown } | null;
  return !!ref && typeof ref === "object" && ref.kind === REMEDIATION_KIND;
}

type Outcome =
  | "SELECTABLE"
  | "DUPLICATE_EQUIVALENT"
  | "CONFLICT_ENGINE_PICK"
  | "CONFLICT_SHADOWED"
  | "OUT_OF_SCOPE_INACTIVE"
  | "OUT_OF_SCOPE_STANDALONE"
  | "OUT_OF_SCOPE_OTHER_CONTRACT"
  | "OUT_OF_SCOPE_NOT_EFFECTIVE";

interface Gate {
  id: string;
  title: string;
  pass: boolean;
  detail: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
}

function countBy<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function decimalCompare(a: Prisma.Decimal, b: Prisma.Decimal): number {
  return a.comparedTo(b);
}

async function main(): Promise<number> {
  const todayIso = arg("today") ?? operatingTodayISO();
  const dates = { yesterday: addDays(todayIso, -1), today: todayIso, future: addDays(todayIso, 30) };
  const expectedLogicalRaw = arg("expected-logical");
  const expectedLogical = expectedLogicalRaw ? Number.parseInt(expectedLogicalRaw, 10) : null;

  const report = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

      const provider = await tx.provider.findFirst({
        where: { id: REVIEWED.providerId, tenantId: REVIEWED.tenantId },
        select: { id: true, tenantId: true, name: true, contractStatus: true },
      });
      const branches = await tx.providerBranch.findMany({
        where: { providerId: REVIEWED.providerId, tenantId: REVIEWED.tenantId },
        select: { id: true, name: true, isActive: true },
        orderBy: { id: "asc" },
      });
      const contracts = await tx.providerContract.findMany({
        where: { providerId: REVIEWED.providerId, tenantId: REVIEWED.tenantId },
        select: {
          id: true, contractNumber: true, status: true, currency: true, startDate: true, endDate: true,
          branchScope: true, currentVersionId: true, taxInclusive: true, paymentTermDays: true,
          unlistedServiceRule: true, balanceBillingPolicy: true, submissionWindowDays: true, executionStatus: true,
        },
        orderBy: { startDate: "asc" },
      });
      const contract = contracts.find((c) => c.id === REVIEWED.contractId) ?? null;
      const version = contract?.currentVersionId
        ? await tx.contractVersion.findUnique({
            where: { id: contract.currentVersionId },
            select: { id: true, versionNumber: true, status: true, effectiveFrom: true, effectiveTo: true },
          })
        : null;
      const applicability = await tx.contractApplicability.findMany({
        where: { contractId: REVIEWED.contractId },
        select: { id: true, clientId: true, groupId: true, inclusionType: true, isActive: true, effectiveFrom: true, effectiveTo: true, versionId: true },
      });
      const taxonomy = await tx.serviceCategory.findMany({
        where: { tenantId: REVIEWED.tenantId },
        select: { id: true, code: true, name: true, tier: true, parentId: true },
      });
      const tariffs: TariffRow[] = await tx.providerTariff.findMany({
        where: { providerId: REVIEWED.providerId },
        select: {
          id: true, contractId: true, versionId: true, branchId: true, clientId: true, cptCode: true, providerServiceCode: true,
          serviceName: true, standardDescription: true, providerDescription: true, agreedRate: true, currency: true,
          tariffType: true, rateType: true, discountPct: true, markupPct: true, minPayableAmount: true, maxPayableAmount: true,
          quantityLimit: true, maxQuantityPerVisit: true, requiresPreauth: true, requiresReferral: true, rateMissing: true,
          externalScheme: true, externalRebateAmount: true, serviceCategoryId: true, unitOfMeasure: true,
          effectiveFrom: true, effectiveTo: true, isActive: true, notes: true, sourceRef: true,
        },
        orderBy: { id: "asc" },
      });

      const includeClientIds = [...new Set(applicability.filter((a) => a.isActive && a.inclusionType === "INCLUDE").map((a) => a.clientId))];
      const sampleMembers = includeClientIds.length
        ? await tx.member.findMany({
            where: { tenantId: REVIEWED.tenantId, status: "ACTIVE", group: { clientId: { in: includeClientIds } } },
            select: { id: true, group: { select: { clientId: true } } },
            orderBy: { id: "asc" },
            take: 3,
          })
        : [];

      // The engine's own candidate sets (same function adjudication calls).
      const candidateSets: Record<string, Record<string, ProviderTariff[]>> = {};
      for (const [label, iso] of Object.entries(dates)) {
        candidateSets[label] = {};
        for (const clientId of includeClientIds.length ? includeClientIds : [null as unknown as string]) {
          candidateSets[label][clientId ?? "none"] = await loadCandidateTariffs(tx, {
            contractId: REVIEWED.contractId,
            pricingDate: new Date(`${iso}T00:00:00Z`),
            providerBranchId: REVIEWED.branchId,
            clientId,
          });
        }
      }

      return { provider, branches, contracts, contract, version, applicability, taxonomy, tariffs, includeClientIds, sampleMembers, candidateSets };
    },
    { timeout: 180_000, maxWait: 30_000 },
  );

  // Engine contract matching for sample members × branch × three dates. Called
  // as-is (reads only) because it IS the engine's stage 1–2.
  const prechecks: Array<{ member: string; date: string; matched: boolean; contractId: string | null; reasonCode: string | null }> = [];
  for (const m of report.sampleMembers) {
    for (const [label, iso] of Object.entries(dates)) {
      const r = await ContractLifecycleService.precheck({
        tenantId: REVIEWED.tenantId,
        providerId: REVIEWED.providerId,
        providerBranchId: REVIEWED.branchId,
        clientId: m.group?.clientId ?? null,
        pricingDate: new Date(`${iso}T00:00:00Z`),
      });
      prechecks.push({ member: m.id, date: `${label} ${iso}`, matched: r.matched, contractId: r.contract?.id ?? null, reasonCode: r.reasonCode ?? null });
    }
  }

  // ── Row outcomes (every row gets exactly one) ──────────────────────────────
  const clientKey = report.includeClientIds[0] ?? "none";
  const todaySet = report.candidateSets.today?.[clientKey] ?? [];
  const todayIds = new Set(todaySet.map((t) => t.id));
  const index = new TariffResolutionIndex(todaySet);
  const verdicts = index.verdictMap();
  const byId = new Map(report.tariffs.map((t) => [t.id, t]));

  const outcomeOf = (t: TariffRow): Outcome => {
    if (!t.isActive) return "OUT_OF_SCOPE_INACTIVE";
    if (t.contractId === null) return "OUT_OF_SCOPE_STANDALONE";
    if (t.contractId !== REVIEWED.contractId) return "OUT_OF_SCOPE_OTHER_CONTRACT";
    if (!todayIds.has(t.id)) return "OUT_OF_SCOPE_NOT_EFFECTIVE";
    const v = verdicts.get(t.id)!;
    if (v.status === "SELECTABLE") return "SELECTABLE";
    if (v.status === "AMBIGUOUS") return "CONFLICT_ENGINE_PICK";
    const engineRow = byId.get(v.engineTariffId);
    return engineRow && pricingTermsKey(engineRow) === pricingTermsKey(t) ? "DUPLICATE_EQUIVALENT" : "CONFLICT_SHADOWED";
  };
  const outcomes = report.tariffs.map((t) => ({ t, outcome: outcomeOf(t), source: isRemediationRow(t) ? "P01.02 replacement" : "original load" }));
  const outcomeCounts = countBy(outcomes, (o) => o.outcome);
  const outcomeBySource = countBy(outcomes, (o) => `${o.source} → ${o.outcome}`);
  const reconciled = Object.values(outcomeCounts).reduce((a, b) => a + b, 0);
  const sourceRows = outcomes.filter((o) => o.source === "original load").length;
  const replacementRows = outcomes.length - sourceRows;
  const logicalServices = todaySet.filter((t) => verdicts.get(t.id)?.engineTariffId === t.id).length;
  // Every description field, not just the service name (HMS/CSV rails).
  const textGroups = index.textKeyGroups();
  const textConflicts = textGroups.filter((g) => !g.samePricing).length;
  const textDuplicates = textGroups.filter((g) => g.samePricing).length;

  // Collision groups (engine view), for the P01.02 manifest.
  const groups = new Map<string, TariffRow[]>();
  for (const t of todaySet) {
    const v = verdicts.get(t.id)!;
    if (v.groupTariffIds.length === 0 && v.status === "SELECTABLE") continue;
    const key = v.engineTariffId;
    groups.set(key, [...(groups.get(key) ?? []), byId.get(t.id)!]);
  }

  // Exact duplicates / conflicts by (normalised name, category, scope, dates).
  const active = report.tariffs.filter((t) => t.isActive);
  const scopeKey = (t: TariffRow) =>
    [normalizeServiceText(t.serviceName), t.serviceCategoryId, t.contractId, t.branchId, t.clientId, t.effectiveFrom.toISOString(), t.effectiveTo?.toISOString() ?? ""].join("|");
  const scopeGroups = new Map<string, TariffRow[]>();
  for (const t of active) scopeGroups.set(scopeKey(t), [...(scopeGroups.get(scopeKey(t)) ?? []), t]);
  let exactDuplicateGroups = 0;
  let exactConflictGroups = 0;
  for (const g of scopeGroups.values()) {
    if (g.length < 2) continue;
    if (new Set(g.map(pricingTermsKey)).size === 1) exactDuplicateGroups += 1;
    else exactConflictGroups += 1;
  }

  // Rates (decimal-safe).
  const rates = active.map((t) => t.agreedRate).sort(decimalCompare);
  const median = rates.length ? rates[Math.floor((rates.length - 1) / 2)] : null;
  const nonPositive = active.filter((t) => t.agreedRate.lte(0)).length;
  const nonBaseCurrency = active.filter((t) => t.currency.toUpperCase() !== REVIEWED.currency).length;
  const contractCurrencyMismatch = report.contract ? active.filter((t) => t.currency.toUpperCase() !== report.contract!.currency.toUpperCase()).length : active.length;

  // Categories.
  const taxonomyById = new Map(report.taxonomy.map((c) => [c.id, c]));
  const categoryOf = (t: TariffRow) => {
    const chain = taxonomyChain(taxonomyById, t.serviceCategoryId);
    return { code: chain[0]?.code ?? "(none)", ...lineCategoryForTaxonomy(chain) };
  };
  const categoryRows = active.map((t) => ({ t, c: categoryOf(t) }));
  const unmapped = categoryRows.filter((r) => r.c.basis === "UNMAPPED").length;

  // ── Hard gates (plan P01.01) ───────────────────────────────────────────────
  const activeContracts = report.contracts.filter((c) => c.status === "ACTIVE");
  const branch = report.branches.find((b) => b.id === REVIEWED.branchId);
  const everyPrecheckOk = prechecks.length > 0 && prechecks.every((p) => p.matched && p.contractId === REVIEWED.contractId);
  const activeInScope = outcomes.filter((o) => o.t.isActive);
  const activeOutOfScope = activeInScope.filter((o) => o.outcome.startsWith("OUT_OF_SCOPE")).length;
  const notOnCurrentVersion = active.filter((t) => t.contractId === REVIEWED.contractId && t.versionId !== report.contract?.currentVersionId).length;
  const conflicts = (outcomeCounts.CONFLICT_ENGINE_PICK ?? 0) + (outcomeCounts.CONFLICT_SHADOWED ?? 0);
  const duplicates = outcomeCounts.DUPLICATE_EQUIVALENT ?? 0;

  const gates: Gate[] = [
    {
      id: "G1",
      title: "Exactly one intended provider and active trial contract resolve",
      pass: !!report.provider && report.provider.contractStatus === "ACTIVE" && activeContracts.length === 1 && activeContracts[0].id === REVIEWED.contractId && !!report.version,
      detail: `provider ${report.provider ? `${report.provider.id} (${report.provider.contractStatus})` : "NOT FOUND"}; ACTIVE contracts ${activeContracts.map((c) => c.contractNumber).join(", ") || "none"}; current version ${report.version ? `v${report.version.versionNumber} ${report.version.status}` : "none"}`,
    },
    {
      id: "G2",
      title: "Every imported source row reconciles to one outcome; logical services equal the reviewed post-duplicate count",
      pass:
        sourceRows === REVIEWED.expectedSourceRows && reconciled === report.tariffs.length && conflicts === 0 && duplicates === 0 &&
        textConflicts === 0 && textDuplicates === 0 && expectedLogical !== null && logicalServices === expectedLogical,
      detail: `original-load rows ${sourceRows} (expected ${REVIEWED.expectedSourceRows}) + P01.02 replacements ${replacementRows}; reconciled ${reconciled}/${report.tariffs.length}; logical services ${logicalServices} (reviewed expectation ${expectedLogical ?? "NOT SUPPLIED — review required"}); duplicates ${duplicates}; conflicts ${conflicts}; description-key collisions across all fields: ${textConflicts} conflicting, ${textDuplicates} equivalent`,
    },
    {
      id: "G3",
      title: "No missing, zero, negative or non-UGX rate",
      pass: nonPositive === 0 && nonBaseCurrency === 0 && contractCurrencyMismatch === 0 && active.every((t) => !t.rateMissing),
      detail: `non-positive ${nonPositive}; non-${REVIEWED.currency} ${nonBaseCurrency}; ≠ contract currency ${contractCurrencyMismatch}; rateMissing ${active.filter((t) => t.rateMissing).length}`,
    },
    {
      id: "G4",
      title: "Every user-visible tariff row is in the exact scope the engine evaluates",
      pass: activeOutOfScope === 0 && notOnCurrentVersion === 0,
      detail: `active rows outside the engine's candidate set ${activeOutOfScope}; active contract rows not on the current version ${notOnCurrentVersion}`,
    },
    {
      id: "G5",
      title: "Contract, branch, client and date resolution are unambiguous",
      pass: !!branch?.isActive && report.includeClientIds.length === 1 && everyPrecheckOk,
      detail: `branch ${branch ? `${branch.id} ${branch.isActive ? "active" : "INACTIVE"}` : "NOT FOUND"}; INCLUDE clients ${report.includeClientIds.length}; prechecks ${prechecks.filter((p) => p.matched).length}/${prechecks.length} matched ${REVIEWED.contractId}`,
    },
    {
      id: "G6",
      title: "Facility-confirmed terms are on the contract (tax-inclusive, 30 days, UGX)",
      pass: !!report.contract && report.contract.taxInclusive === REVIEWED.taxInclusive && report.contract.paymentTermDays === REVIEWED.paymentTermDays && report.contract.currency.toUpperCase() === REVIEWED.currency,
      detail: report.contract ? `taxInclusive ${report.contract.taxInclusive}; paymentTermDays ${report.contract.paymentTermDays}; currency ${report.contract.currency}` : "contract not found",
    },
  ];
  const blockers = gates.filter((g) => !g.pass);

  // ── Output ─────────────────────────────────────────────────────────────────
  const c = report.contract;
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push(`# P01.01 — Family tariff preflight`);
  push();
  push(`Generated ${new Date().toISOString()} · runtime TZ ${process.env.TZ} · Kampala today ${todayIso} · **${blockers.length === 0 ? "PASS — every hard gate passes" : `NO-GO — ${blockers.length} release blocker(s)`}**`);
  push();
  push(`Read-only. Reviewed IDs: tenant \`${REVIEWED.tenantId}\`, provider \`${REVIEWED.providerId}\`, branch \`${REVIEWED.branchId}\`, contract \`${REVIEWED.contractId}\`.`);
  push();
  push(`## Hard gates`);
  push();
  push(`| Gate | Result | Check | Evidence |`);
  push(`|---|---|---|---|`);
  for (const g of gates) push(`| ${g.id} | ${g.pass ? "PASS" : "**FAIL**"} | ${g.title} | ${g.detail} |`);
  push();
  push(`## 1. Provider, branch, payer, contract, version`);
  push();
  push(`- Provider: \`${report.provider?.id}\` — ${report.provider?.name} — contractStatus ${report.provider?.contractStatus}`);
  push(`- Branches: ${report.branches.map((b) => `\`${b.id}\` "${b.name}" (${b.isActive ? "active" : "inactive"})`).join("; ")}`);
  push(`- Contracts for provider: ${report.contracts.map((x) => `${x.contractNumber} \`${x.id}\` ${x.status} ${x.currency} ${isoDay(x.startDate)}→${isoDay(x.endDate)}`).join("; ")}`);
  if (c) {
    push(`- Reviewed contract: ${c.contractNumber} · ${c.status} · execution ${c.executionStatus} · branch scope ${c.branchScope} · currency ${c.currency} · ${isoDay(c.startDate)} → ${isoDay(c.endDate)}`);
    push(`- Terms: taxInclusive **${c.taxInclusive}** · payment ${c.paymentTermDays} days · unlisted rule ${c.unlistedServiceRule} · balance billing **${c.balanceBillingPolicy ?? "UNKNOWN (not supplied)"}** · submission window **${c.submissionWindowDays ?? "UNKNOWN (not supplied)"}**`);
  }
  push(`- Current version: ${report.version ? `\`${report.version.id}\` v${report.version.versionNumber} ${report.version.status} from ${isoDay(report.version.effectiveFrom)}${report.version.effectiveTo ? ` to ${isoDay(report.version.effectiveTo)}` : ""}` : "none"}`);
  push(`- Applicability: ${report.applicability.map((a) => `${a.inclusionType} client \`${a.clientId}\`${a.groupId ? ` group \`${a.groupId}\`` : ""} ${a.isActive ? "active" : "inactive"} from ${isoDay(a.effectiveFrom)}${a.effectiveTo ? ` to ${isoDay(a.effectiveTo)}` : ""}`).join("; ") || "none"}`);
  push();
  push(`## 2. Row counts`);
  push();
  push(`- Total \`ProviderTariff\` rows for the provider: **${report.tariffs.length}** (source load: ${REVIEWED.expectedSourceRows}); active ${active.length}`);
  push(`- Engine candidate rows (contract, branch, client) — yesterday ${dates.yesterday}: ${report.candidateSets.yesterday?.[clientKey]?.length ?? 0}; today ${dates.today}: ${todaySet.length}; future ${dates.future}: ${report.candidateSets.future?.[clientKey]?.length ?? 0}`);
  push(`- Active/effective logical services (engine view, today): **${logicalServices}**`);
  push();
  push(`## 3. Grouped counts (all rows)`);
  push();
  const groupedTable = (title: string, counts: Record<string, number>) => {
    push(`**${title}:** ${Object.entries(counts).map(([k, v]) => `\`${k}\` ${v}`).join(" · ")}`);
    push();
  };
  groupedTable("contractId", countBy(report.tariffs, (t) => t.contractId ?? "(standalone)"));
  groupedTable("versionId", countBy(report.tariffs, (t) => t.versionId ?? "(none)"));
  groupedTable("branchId", countBy(report.tariffs, (t) => t.branchId ?? "(all branches)"));
  groupedTable("clientId", countBy(report.tariffs, (t) => t.clientId ?? "(all payers)"));
  groupedTable("currency", countBy(report.tariffs, (t) => t.currency));
  groupedTable("isActive", countBy(report.tariffs, (t) => String(t.isActive)));
  groupedTable("effective window", countBy(report.tariffs, (t) => `${isoDay(t.effectiveFrom)}→${t.effectiveTo ? isoDay(t.effectiveTo) : "open"}`));
  groupedTable("rate type", countBy(report.tariffs, (t) => t.rateType));
  groupedTable("unit of measure", countBy(report.tariffs, (t) => t.unitOfMeasure));
  push(`## 4. Rates (active rows)`);
  push();
  push(`- Null ${0} (column is NOT NULL) · zero/negative ${nonPositive} · rateMissing ${active.filter((t) => t.rateMissing).length} · non-${REVIEWED.currency} ${nonBaseCurrency}`);
  push(`- Min ${rates[0]?.toString() ?? "—"} · median ${median?.toString() ?? "—"} · max ${rates[rates.length - 1]?.toString() ?? "—"} (${REVIEWED.currency})`);
  push(`- Rows carrying a PROVISIONAL note (7 confirmed-by-rule prices of 2026-08-28): ${active.filter((t) => /PROVISIONAL/i.test(t.notes ?? "")).length}`);
  push();
  push(`## 5. Duplicates and conflicts`);
  push();
  push(`By (normalised name, category, scope, effective dates): exact-duplicate groups ${exactDuplicateGroups} · conflict groups ${exactConflictGroups}.`);
  push();
  push(`**Engine view** (what adjudication can actually tell apart — it ignores category): ${groups.size} collision group(s). Row outcomes below.`);
  push();
  if (groups.size > 0) {
    push(`| Engine picks | Rows in group | Same pricing? | Rows (id · name · rate · category · note) |`);
    push(`|---|---|---|---|`);
    for (const [engineId, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const same = new Set(rows.map(pricingTermsKey)).size === 1;
      push(`| \`${engineId}\` | ${rows.length} | ${same ? "yes — equivalent" : "**NO — conflict**"} | ${rows.map((r) => `\`${r.id}\` · ${r.serviceName} · ${r.agreedRate.toString()} · ${categoryOf(r).code} · ${r.notes ?? ""}`).join("<br>")} |`);
    }
    push();
  }
  push(`## 6. Attachment`);
  push();
  push(`- Standalone (contractId null): ${report.tariffs.filter((t) => t.contractId === null).length} · attached to another contract: ${report.tariffs.filter((t) => t.contractId && t.contractId !== REVIEWED.contractId).length} · on reviewed contract but not current version: ${notOnCurrentVersion}`);
  push();
  push(`## 7. Codes despite the confirmed no-code policy`);
  push();
  push(`- Rows with a CPT code: ${report.tariffs.filter((t) => t.cptCode).length} · with a provider service code: ${report.tariffs.filter((t) => t.providerServiceCode).length}`);
  push();
  push(`## 8. Category mapping (active rows → claim-line category, DEC-FH-X1)`);
  push();
  push(`| Taxonomy code | Rows | Line category | Basis |`);
  push(`|---|---|---|---|`);
  const catAgg = new Map<string, { n: number; category: string; basis: string }>();
  for (const r of categoryRows) {
    const e = catAgg.get(r.c.code) ?? { n: 0, category: r.c.category, basis: r.c.basis };
    e.n += 1;
    catAgg.set(r.c.code, e);
  }
  for (const [code, e] of [...catAgg.entries()].sort((a, b) => b[1].n - a[1].n)) push(`| ${code} | ${e.n} | ${e.category} | ${e.basis} |`);
  push();
  push(`Unmapped (OTHER by default, needs review): ${unmapped}`);
  push();
  push(`## 9. Engine contract context — sample members × branch × dates`);
  push();
  push(`Sample members are the first three ACTIVE members of the applicable payer by opaque id (no member numbers or names in this report).`);
  push();
  push(`| Member (opaque) | Date | Matched | Contract | Reason |`);
  push(`|---|---|---|---|---|`);
  for (const p of prechecks) push(`| \`${p.member}\` | ${p.date} | ${p.matched ? "yes" : "**no**"} | ${p.contractId ?? "—"} | ${p.reasonCode ?? ""} |`);
  push();
  push(`## 10. Would the engine load these rows?`);
  push();
  push(`The candidate sets above were produced by \`loadCandidateTariffs\` — the function \`ContractEngine.evaluateClaim\` calls (src/server/services/contract-engine/engine.ts). A row is loaded by the engine for this context if and only if its outcome below is not \`OUT_OF_SCOPE_*\`.`);
  push();
  push(`## Row outcomes (reconciliation — every row exactly once)`);
  push();
  push(`| Source → outcome | Rows |`);
  push(`|---|---|`);
  for (const [k, v] of Object.entries(outcomeBySource)) push(`| ${k} | ${v} |`);
  push(`| **Total** | **${reconciled}** |`);
  push();
  push(`Description-key collisions across serviceName / standardDescription / providerDescription (what HMS and CSV lines are matched against): ${textConflicts} conflicting, ${textDuplicates} equivalent.`);
  push();

  const markdown = lines.join("\n");
  const json = {
    generatedAt: new Date().toISOString(),
    reviewed: REVIEWED,
    dates,
    gates,
    outcomeCounts,
    outcomeBySource,
    sourceRows,
    replacementRows,
    logicalServices,
    expectedLogical,
    descriptionKeyCollisions: { conflicting: textConflicts, equivalent: textDuplicates },
    collisionGroups: [...groups.entries()].map(([engineTariffId, rows]) => ({
      engineTariffId,
      samePricing: new Set(rows.map(pricingTermsKey)).size === 1,
      rows: rows.map((r) => ({ id: r.id, serviceName: r.serviceName, agreedRate: r.agreedRate.toString(), category: categoryOf(r).code, notes: r.notes })),
    })),
    rowOutcomes: outcomes.map((o) => ({ id: o.t.id, outcome: o.outcome })),
    prechecks,
  };

  const out = arg("out");
  if (out) {
    mkdirSync(out, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    writeFileSync(join(out, `P01.01-preflight-${stamp}.md`), markdown + "\n");
    writeFileSync(join(out, `P01.01-preflight-${stamp}.json`), JSON.stringify(json, null, 2) + "\n");
    console.error(`wrote ${join(out, `P01.01-preflight-${stamp}.{md,json}`)}`);
  }
  console.log(process.argv.includes("--json") ? JSON.stringify(json, null, 2) : markdown);
  return blockers.length === 0 ? 0 : 2;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("preflight failed:", err instanceof Error ? err.message : err);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
