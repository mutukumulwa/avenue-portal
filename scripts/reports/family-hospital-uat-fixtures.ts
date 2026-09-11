/**
 * Family Hospital UAT plan P07.02 — the fixtures the Family rerun starts from,
 * with every expected value derived from the database, not from a screen.
 *
 *   DATABASE_URL=<url> npx tsx scripts/reports/family-hospital-uat-fixtures.ts [--out <dir>] [--today YYYY-MM-DD]
 *
 * What it proves, for the reviewed ids in scripts/lib/family-hospital-reviewed.ts:
 *
 *  1. Members — each named trial member through `ProviderEligibilityService.check`
 *     (the service the eligibility page calls) at Family's branch on Kampala
 *     today, and the contract the engine matches for them
 *     (`ContractLifecycleService.precheck`).
 *  2. Services — each fixture tariff row: its contracted rate, unit, currency,
 *     rate type and category, and that the engine resolves a line carrying that
 *     service to that very row on the pricing date (`TariffResolutionIndex`,
 *     the engine's own selection). The expected contracted amount for one unit
 *     is the row's rate — Family's rows are FIXED, with no discount or markup.
 *  3. The unlisted scenario — no row matches the description, and the
 *     contract's unlisted-service rule decides what a claim line gets.
 *  4. Actors — Family's user accounts: persona, active, set up or not. No names
 *     or email addresses.
 *
 * READ-ONLY, with one exception stated plainly: the eligibility service records
 * every check it makes, so it runs inside a transaction this script always
 * rolls back. Nothing it writes survives. Every other query runs in one
 * `SET TRANSACTION READ ONLY` transaction, or through the engine's own
 * read-only pre-check.
 *
 * Output (restricted): JSON + Markdown under --out (default
 * docs/provider-onboarding/evidence). Opaque ids and masked member numbers only.
 *
 * Exit codes: 0 every fixture verified · 2 a fixture failed a check · 1 error.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { operatingTodayISO } from "@/lib/service-date";
import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";
import { ProviderEligibilityService, type EligibilitySafeResult } from "@/server/services/provider-eligibility.service";
import {
  loadCandidateTariffs,
  normalizeServiceText,
  TariffResolutionIndex,
} from "@/server/services/contract-engine/tariff-selection";
import { lineCategoryForTaxonomy, taxonomyChain } from "@/lib/claim-line-category";
import { FAMILY_P0702_FIXTURES, FAMILY_REVIEWED } from "../lib/family-hospital-reviewed";

// Production (Vercel) evaluates in UTC; so does the engine's day arithmetic.
process.env.TZ = "UTC";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * The provider screens' mask ("•••• 0001"), repeated here because the case
 * context service is `server-only` and cannot be imported from a script.
 */
function maskMemberNumber(memberNumber: string): string {
  const compact = memberNumber.replace(/\s+/g, "");
  return compact.length <= 4 ? "••••" : `•••• ${compact.slice(-4)}`;
}

/** A Markdown table cell: a price-list name may itself contain "|". */
function cell(text: string | null): string {
  return (text ?? "—").replace(/\|/g, "\\|");
}

class Rollback extends Error {
  constructor(readonly result: EligibilitySafeResult) {
    super("rollback");
  }
}

async function main(): Promise<number> {
  const today = arg("today") ?? operatingTodayISO();
  const pricingDate = new Date(`${today}T00:00:00Z`);
  const outDir = arg("out") ?? join(process.cwd(), "docs/provider-onboarding/evidence");
  const problems: string[] = [];

  // ── 1. Everything read directly, in one read-only transaction ────────────
  const snap = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const contract = await tx.providerContract.findFirst({
        where: { id: FAMILY_REVIEWED.contractId, tenantId: FAMILY_REVIEWED.tenantId, providerId: FAMILY_REVIEWED.providerId },
        select: { id: true, contractNumber: true, status: true, currency: true, currentVersionId: true, unlistedServiceRule: true, unlistedDiscountPct: true, taxInclusive: true },
      });
      const members = await tx.member.findMany({
        where: { tenantId: FAMILY_REVIEWED.tenantId, memberNumber: { in: [...FAMILY_P0702_FIXTURES.members] } },
        select: { id: true, memberNumber: true, status: true, coverStartDate: true, coverEndDate: true, group: { select: { clientId: true } } },
      });
      const taxonomy = await tx.serviceCategory.findMany({
        where: { tenantId: FAMILY_REVIEWED.tenantId },
        select: { id: true, code: true, name: true, tier: true, parentId: true },
      });
      const candidates = await loadCandidateTariffs(tx, {
        contractId: FAMILY_REVIEWED.contractId,
        pricingDate,
        providerBranchId: FAMILY_REVIEWED.branchId,
        clientId: members[0]?.group?.clientId ?? null,
      });
      const users = await tx.user.findMany({
        where: { tenantId: FAMILY_REVIEWED.tenantId, providerId: FAMILY_REVIEWED.providerId },
        select: {
          id: true, role: true, isActive: true, mustChangePassword: true, lastLoginAt: true,
          roleAssignments: { where: { isActive: true, status: "ACTIVE" }, select: { role: { select: { code: true } } } },
        },
        orderBy: { createdAt: "asc" },
      });
      const branchAssignments = await tx.providerUserBranchAssignment.findMany({
        where: { tenantId: FAMILY_REVIEWED.tenantId, providerId: FAMILY_REVIEWED.providerId, activeTo: null },
        select: { userId: true, providerBranchId: true },
      });
      return { contract, members, taxonomy, candidates, users, branchAssignments };
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  if (!snap.contract) throw new Error(`Contract ${FAMILY_REVIEWED.contractId} not found for Family.`);

  // ── 2. Members: the eligibility service, rolled back; the engine's contract match ──
  const memberRows = [];
  for (const number of FAMILY_P0702_FIXTURES.members) {
    const m = snap.members.find((x) => x.memberNumber === number);
    if (!m) {
      problems.push(`member ${maskMemberNumber(number)} not found`);
      memberRows.push({ member: maskMemberNumber(number), found: false });
      continue;
    }
    let result: EligibilitySafeResult | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2s'");
        const r = await ProviderEligibilityService.check(
          {
            ctx: {
              actorType: "USER",
              // Never persisted (rolled back); names the operator running the report.
              actorId: "p0702-fixture-report",
              tenantId: FAMILY_REVIEWED.tenantId,
              providerId: FAMILY_REVIEWED.providerId,
              allowedProviderBranchIds: [FAMILY_REVIEWED.branchId],
              permissions: ["provider.eligibility.read"],
              apiScopes: [],
              requestId: `p0702-${today}`,
            },
            memberNumber: number,
            providerBranchId: FAMILY_REVIEWED.branchId,
            serviceDate: pricingDate,
          },
          tx,
        );
        throw new Rollback(r);
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
      result = err.result;
    }
    const precheck = await ContractLifecycleService.precheck({
      tenantId: FAMILY_REVIEWED.tenantId,
      providerId: FAMILY_REVIEWED.providerId,
      providerBranchId: FAMILY_REVIEWED.branchId,
      clientId: m.group?.clientId ?? null,
      pricingDate,
    });
    const row = {
      member: maskMemberNumber(number),
      memberId: m.id,
      status: m.status,
      coverStart: m.coverStartDate?.toISOString().slice(0, 10) ?? null,
      coverEnd: m.coverEndDate?.toISOString().slice(0, 10) ?? null,
      eligibility: result ? { resultCode: result.resultCode, reasonCode: result.decision.reasonCode, found: result.found } : null,
      contract: precheck.matched ? precheck.contract?.contractNumber ?? null : null,
      contractReason: precheck.matched ? null : precheck.reasonCode ?? null,
    };
    if (!result || result.resultCode !== "ELIGIBLE") problems.push(`${row.member}: eligibility ${result?.resultCode ?? "no result"} (${result?.decision.reasonCode ?? "—"})`);
    if (!precheck.matched || precheck.contract?.id !== FAMILY_REVIEWED.contractId) problems.push(`${row.member}: engine contract ${precheck.contract?.contractNumber ?? precheck.reasonCode}`);
    memberRows.push(row);
  }

  // ── 3. Services: the tariff row and the engine's own resolution ────────────
  const index = new TariffResolutionIndex(snap.candidates);
  const taxonomyById = new Map(snap.taxonomy.map((c) => [c.id, c]));
  type ServiceRow = {
    area: string;
    tariffId: string;
    inScope: boolean;
    serviceName: string | null;
    taxonomy: string | null;
    lineCategory: string | null;
    unit: string | null;
    currency: string | null;
    rateType: string | null;
    contractedUnitRate: string | null;
    expectedContractedForOneUnit: string | null;
    requiresPreauth: boolean | null;
    effectiveFrom: string | null;
    engine: { status: string | null; method: string | null; resolvesToSelf: boolean };
  };
  const serviceRows: ServiceRow[] = FAMILY_P0702_FIXTURES.services.map((s) => {
    const t = snap.candidates.find((c) => c.id === s.tariffId);
    if (!t) {
      problems.push(`${s.area}: tariff ${s.tariffId} is not in the engine's candidate set for ${today}`);
      return {
        area: s.area, tariffId: s.tariffId, inScope: false, serviceName: null, taxonomy: null, lineCategory: null, unit: null, currency: null,
        rateType: null, contractedUnitRate: null, expectedContractedForOneUnit: null, requiresPreauth: null, effectiveFrom: null,
        engine: { status: null, method: null, resolvesToSelf: false },
      };
    }
    const verdict = index.verdict(t.id);
    const engine = index.select({ cptCode: null, providerServiceCode: null, description: t.serviceName });
    const chain = taxonomyChain(taxonomyById, t.serviceCategoryId);
    const lineCategory = lineCategoryForTaxonomy(chain).category;
    const plainFixed = t.rateType === "FIXED" && !t.discountPct && !t.markupPct && !t.rateMissing;
    if (verdict?.status !== "SELECTABLE" || engine?.tariff.id !== t.id) problems.push(`${s.area}: engine resolves "${t.serviceName}" to ${engine?.tariff.id ?? "nothing"} (${verdict?.status})`);
    if (t.currency.toUpperCase() !== snap.contract!.currency.toUpperCase()) problems.push(`${s.area}: currency ${t.currency} ≠ contract ${snap.contract!.currency}`);
    if (!plainFixed) problems.push(`${s.area}: not a plain FIXED rate (rate type ${t.rateType})`);
    return {
      area: s.area,
      tariffId: t.id,
      inScope: true,
      serviceName: t.serviceName,
      taxonomy: chain[0]?.code ?? null,
      lineCategory,
      unit: t.unitOfMeasure,
      currency: t.currency,
      rateType: t.rateType,
      contractedUnitRate: t.agreedRate.toString(),
      expectedContractedForOneUnit: t.agreedRate.toString(),
      requiresPreauth: t.requiresPreauth,
      effectiveFrom: t.effectiveFrom.toISOString().slice(0, 10),
      engine: { status: verdict?.status ?? null, method: engine?.method ?? null, resolvesToSelf: engine?.tariff.id === t.id },
    };
  });

  // ── 4. The unlisted scenario ───────────────────────────────────────────────
  const unlistedKey = normalizeServiceText(FAMILY_P0702_FIXTURES.unlistedDescription);
  const unlistedHit = index.select({ cptCode: null, providerServiceCode: null, description: FAMILY_P0702_FIXTURES.unlistedDescription });
  const unlistedNear = snap.candidates.filter((c) => normalizeServiceText(c.serviceName).includes(unlistedKey.split(" ")[0])).length;
  if (unlistedHit) problems.push(`unlisted: "${FAMILY_P0702_FIXTURES.unlistedDescription}" matches ${unlistedHit.tariff.id}`);
  const unlisted = {
    description: FAMILY_P0702_FIXTURES.unlistedDescription,
    engineMatch: unlistedHit?.tariff.id ?? null,
    rowsContainingFirstWord: unlistedNear,
    contractRule: snap.contract.unlistedServiceRule,
    expected:
      snap.contract.unlistedServiceRule === "REJECT"
        ? "refused at capture: the contract does not accept unlisted services"
        : "accepted with a typed description and billed price, labelled \"Not in contracted tariff — manual review\"; no contracted rate and no global CPT price",
  };

  // ── 5. Actors ──────────────────────────────────────────────────────────────
  const actors = snap.users.map((u) => ({
    userId: u.id,
    personas: u.roleAssignments.map((a) => a.role.code).sort(),
    isActive: u.isActive,
    setUp: !u.mustChangePassword,
    lastSignIn: u.lastLoginAt?.toISOString() ?? null,
    branches: snap.branchAssignments.filter((b) => b.userId === u.id).length,
  }));
  for (const persona of ["PROVIDER_FACILITY_ADMIN", "PROVIDER_FRONT_DESK", "PROVIDER_BILLER"]) {
    const holders = actors.filter((a) => a.personas.includes(persona) && a.isActive);
    if (holders.length === 0) problems.push(`no active ${persona} account`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    pricingDate: today,
    contract: { id: snap.contract.id, number: snap.contract.contractNumber, status: snap.contract.status, currency: snap.contract.currency, taxInclusive: snap.contract.taxInclusive, unlistedServiceRule: snap.contract.unlistedServiceRule },
    candidateRows: snap.candidates.length,
    members: memberRows,
    services: serviceRows,
    unlisted,
    actors,
    problems,
  };

  const out: string[] = [];
  out.push(`# P07.02 — Family UAT fixtures (${today}, Kampala)`, "");
  out.push("Restricted: production ids. Masked member numbers; no names, dates of birth or email addresses.", "");
  out.push(`Contract **${report.contract.number}** (${report.contract.status}, ${report.contract.currency}, tax ${report.contract.taxInclusive}) · unlisted-service rule **${report.contract.unlistedServiceRule}** · ${report.candidateRows} rows in the engine's candidate set on ${today}.`, "");
  out.push("## Members (eligibility service at Family's branch; engine contract match)", "", "| Member | Status | Cover | Eligibility | Reason | Engine contract |", "|---|---|---|---|---|---|");
  for (const m of memberRows) {
    if (!("memberId" in m)) { out.push(`| ${m.member} | NOT FOUND | | | | |`); continue; }
    out.push(`| ${m.member} | ${m.status} | ${m.coverStart ?? "—"} → ${m.coverEnd ?? "—"} | ${m.eligibility?.resultCode ?? "—"} | ${m.eligibility?.reasonCode ?? "—"} | ${m.contract ?? m.contractReason ?? "—"} |`);
  }
  out.push("", "## Services (expected values from the tariff rows; engine resolution on the pricing date)", "", "| Area | Service (as on the price list) | Line category | Unit | Contracted rate | Expected for 1 unit | Pre-auth on the row | Engine |", "|---|---|---|---|---|---|---|---|");
  for (const s of serviceRows) {
    if (!s.inScope) { out.push(`| ${s.area} | \`${s.tariffId}\` NOT IN SCOPE | | | | | | |`); continue; }
    out.push(`| ${s.area} | ${cell(s.serviceName)} (\`${s.tariffId}\`) | ${s.lineCategory} | ${s.unit ?? "—"} | ${s.currency} ${Number(s.contractedUnitRate).toLocaleString("en-US")} | ${s.currency} ${Number(s.expectedContractedForOneUnit).toLocaleString("en-US")} | ${s.requiresPreauth ? "yes" : "no"} | ${s.engine.status}, ${s.engine.resolvesToSelf ? "resolves to this row" : "RESOLVES ELSEWHERE"} |`);
  }
  out.push("", "## Unlisted service", "", `"${unlisted.description}" — engine match: ${unlisted.engineMatch ?? "none"}; rows containing its first word: ${unlisted.rowsContainingFirstWord}. Contract rule ${unlisted.contractRule}: ${unlisted.expected}.`, "");
  out.push("## Actors (Family accounts)", "", "| User | Personas | Active | Set up | Last sign-in | Branches |", "|---|---|---|---|---|---|");
  for (const a of actors) out.push(`| \`${a.userId}\` | ${a.personas.join(", ") || "—"} | ${a.isActive ? "yes" : "no"} | ${a.setUp ? "yes" : "**no** — awaits a setup link (P05)"} | ${a.lastSignIn ?? "never"} | ${a.branches} |`);
  out.push("", problems.length === 0 ? "**Every fixture verified.**" : `**Problems:**\n\n${problems.map((p) => `- ${p}`).join("\n")}`, "");

  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `P07.02-uat-fixtures-${report.generatedAt.replace(/[:.]/g, "-")}`);
  writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${base}.md`, out.join("\n"));
  console.log(out.join("\n"));
  console.log(`Written: ${base}.{json,md}`);
  return problems.length === 0 ? 0 : 2;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    await prisma.$disconnect().catch(() => undefined);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
