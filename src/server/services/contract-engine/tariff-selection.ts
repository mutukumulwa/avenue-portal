/**
 * Family Hospital UAT plan P01.03 / P02.03 — the contract engine's tariff
 * candidate set and line→tariff selection, extracted so that EVERY reader uses
 * one implementation:
 *
 *   - `ContractEngine.evaluateLine` (adjudication),
 *   - `ProviderContractsService.resolveClaimLineRates` (decision ceiling, PA
 *     gate, tariff stamping, variance),
 *   - the provider service catalogue (what a facility may select), and
 *   - `scripts/reports/family-hospital-tariff-preflight.ts`.
 *
 * Before this module each reader had its own idea of which rows exist and which
 * one wins: the engine read only contract-bound rows and took the FIRST exact
 * description match in database order; the legacy resolver also read standalone
 * (`contractId = null`) rows, matched descriptions with a different normaliser,
 * and resolved the contract without branch or payer scope. A facility could
 * therefore be shown — and bill — a rate the engine would never apply.
 *
 * The two functions the engine used inline are moved here VERBATIM
 * (`candidateTariffWhere` + `selectTariffByCodeOrDescription`), so adjudication
 * behaviour is unchanged. Everything else in this file is analysis built on
 * top of them, and is proven equivalent to them by tests.
 *
 * Rule for this remediation (plan P01.03): standalone rows are never an implicit
 * pricing fallback. They remain admin-maintained reference data only.
 */
import type { Prisma, PrismaClient, ProviderTariff } from "@prisma/client";
import { compareTariffPrecedenceWithBranch } from "../tariff-precedence";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Calendar-day bounds for effectivity windows (moved from the engine, PR-026).
 * Claims carry date-only service dates (midnight) while rules/tariffs are
 * stamped with creation timestamps — a rule captured at 07:15 must still govern
 * services dated that same day, so "effective from" compares against end-of-day
 * and "effective to" against start-of-day.
 */
export function dayBounds(d: Date): { startOfDay: Date; endOfDay: Date } {
  const startOfDay = new Date(d); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(d); endOfDay.setHours(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

/**
 * The engine's description normaliser (moved verbatim): lower-case, every
 * character outside `[a-z0-9 ]` becomes a space, whitespace collapsed.
 *
 * Note what it discards: `<` and `>` included. "(>5 lesions)" and "(<5 lesions)"
 * normalise to the same text — which is why collisions are analysed below
 * rather than assumed away.
 */
export function normalizeServiceText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** The scope the engine evaluates a claim in. */
export interface TariffCandidateScope {
  contractId: string;
  /** `admissionDate ?? dateOfService` for a claim (engine §6.1.1). */
  pricingDate: Date;
  providerBranchId?: string | null;
  clientId?: string | null;
}

/**
 * The engine's candidate filter, verbatim.
 *
 * Preserved quirk, documented rather than changed: when `providerBranchId` is
 * null the first branch clause is `{ branchId: undefined }`, which Prisma reads
 * as "no condition" — so a claim WITHOUT a branch sees every branch's rows. The
 * provider capture paths always resolve a branch (plan P02.01), so the
 * catalogue and the engine evaluate the same, narrower set.
 */
export function candidateTariffWhere(scope: TariffCandidateScope): Prisma.ProviderTariffWhereInput {
  const { startOfDay, endOfDay } = dayBounds(scope.pricingDate);
  return {
    contractId: scope.contractId,
    isActive: true,
    effectiveFrom: { lte: endOfDay },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: startOfDay } }],
    AND: [
      { OR: [{ branchId: scope.providerBranchId ?? undefined }, { branchId: null }] },
      { OR: [{ clientId: scope.clientId ?? null }, { clientId: null }] },
    ],
  };
}

/**
 * The engine's candidate order, verbatim (WP-N2): deterministic, so row order
 * can never be left to the database. The DESCRIPTION step below takes the
 * first match in THIS order.
 */
export const CANDIDATE_TARIFF_ORDER: Prisma.ProviderTariffOrderByWithRelationInput[] = [
  { effectiveFrom: "desc" },
  { id: "asc" },
];

/** Load exactly the rows the engine would consider for a claim in `scope`. */
export async function loadCandidateTariffs(db: Db, scope: TariffCandidateScope): Promise<ProviderTariff[]> {
  return db.providerTariff.findMany({ where: candidateTariffWhere(scope), orderBy: CANDIDATE_TARIFF_ORDER });
}

/** The fields selection reads. `ProviderTariff` satisfies it. */
export interface MatchableTariff {
  id: string;
  cptCode: string | null;
  providerServiceCode: string | null;
  serviceName: string;
  standardDescription: string | null;
  providerDescription: string | null;
  branchId: string | null;
  clientId: string | null;
  contractId: string | null;
  tariffType: string;
  effectiveFrom: Date;
}

export interface LineMatchKey {
  cptCode?: string | null;
  providerServiceCode?: string | null;
  description: string;
}

export type TariffMatchMethod = "CODE" | "DESCRIPTION";

/**
 * Engine stage 3, steps 1–2, verbatim. `tariffs` must be in
 * `CANDIDATE_TARIFF_ORDER` (as `loadCandidateTariffs` returns them).
 *
 *   1. Code — `cptCode` or `providerServiceCode`; branch-specific first, then
 *      the shared precedence (client → contract → type → latest → id).
 *   2. Exact normalised description against `serviceName` /
 *      `standardDescription` / `providerDescription` — the FIRST row in
 *      candidate order. No precedence is applied at this step; that is the
 *      engine's existing behaviour and is why ambiguity is analysed separately.
 *
 * Mapping memory and fuzzy matching (steps 3–4) stay in the engine: they need
 * maker-confirmed memories and never select for a line that already matched.
 */
export function selectTariffByCodeOrDescription<T extends MatchableTariff>(
  tariffs: T[],
  line: LineMatchKey,
): { tariff: T; method: TariffMatchMethod } | null {
  const byCode = tariffs
    .filter(t => (line.cptCode && t.cptCode === line.cptCode) || (line.providerServiceCode && t.providerServiceCode === line.providerServiceCode))
    .sort(compareTariffPrecedenceWithBranch);
  if (byCode.length > 0) return { tariff: byCode[0], method: "CODE" };

  const nd = normalizeServiceText(line.description);
  const exact = tariffs.find(t =>
    normalizeServiceText(t.serviceName) === nd ||
    (t.standardDescription && normalizeServiceText(t.standardDescription) === nd) ||
    (t.providerDescription && normalizeServiceText(t.providerDescription) === nd),
  );
  if (exact) return { tariff: exact, method: "DESCRIPTION" };
  return null;
}

// ─── Analysis: can a row be selected without the engine pricing another? ─────

/** The terms that change what the engine pays for a mapped line. */
export interface PricingTerms {
  agreedRate: { toString(): string } | string | number;
  currency: string;
  rateType: string;
  discountPct?: { toString(): string } | string | number | null;
  markupPct?: { toString(): string } | string | number | null;
  minPayableAmount?: { toString(): string } | string | number | null;
  maxPayableAmount?: { toString(): string } | string | number | null;
  quantityLimit?: number | null;
  maxQuantityPerVisit?: number | null;
  requiresPreauth?: boolean;
  requiresReferral?: boolean;
  rateMissing?: boolean;
  externalScheme?: string | null;
  externalRebateAmount?: { toString(): string } | string | number | null;
}

function decimalKey(v: { toString(): string } | string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  // Canonical decimal text: "4807", "4807.0" and "4807.000…" compare equal.
  const s = typeof v === "number" ? String(v) : v.toString();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [int, frac = ""] = s.split(".");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
}

/** Stable fingerprint of what the engine would pay for a row. */
export function pricingTermsKey(t: PricingTerms): string {
  return [
    decimalKey(t.agreedRate),
    t.currency.toUpperCase(),
    t.rateType,
    decimalKey(t.discountPct),
    decimalKey(t.markupPct),
    decimalKey(t.minPayableAmount),
    decimalKey(t.maxPayableAmount),
    t.quantityLimit ?? "",
    t.maxQuantityPerVisit ?? "",
    t.requiresPreauth ? 1 : 0,
    t.requiresReferral ? 1 : 0,
    t.rateMissing ? 1 : 0,
    t.externalScheme ?? "",
    decimalKey(t.externalRebateAmount),
  ].join("|");
}

/**
 * Why a candidate row can or cannot be offered for selection.
 *
 *   SELECTABLE  the engine, given this row's own codes and name, selects THIS
 *               row, and every row it would also capture is priced identically.
 *   SHADOWED    the engine would select a DIFFERENT row for this row's service
 *               (a duplicate listed elsewhere). Selecting it would bill one row
 *               and price another.
 *   AMBIGUOUS   the engine selects this row, but it also captures rows with
 *               different pricing terms — the engine cannot tell them apart, so
 *               no price shown for any of them is trustworthy.
 */
export type ResolutionStatus = "SELECTABLE" | "SHADOWED" | "AMBIGUOUS";

export interface ResolutionVerdict {
  tariffId: string;
  status: ResolutionStatus;
  /** The row the engine would actually price a line for this service with. */
  engineTariffId: string;
  method: TariffMatchMethod;
  /** Other rows that resolve to the same engine choice (the collision group). */
  groupTariffIds: string[];
}

export type AnalysableTariff = MatchableTariff & PricingTerms;

/**
 * An index over one candidate set that answers "which row would the engine
 * select for this line?" in O(1) per description instead of scanning.
 *
 * `select()` is required to return exactly what `selectTariffByCodeOrDescription`
 * returns for the same input — `tests/services/tariff-selection.test.ts` proves
 * it against randomised candidate sets. If they ever disagree, the index is
 * wrong, not the engine.
 */
export class TariffResolutionIndex<T extends AnalysableTariff> {
  private readonly firstByNormalisedText = new Map<string, T>();
  private readonly byCpt = new Map<string, T[]>();
  private readonly byProviderCode = new Map<string, T[]>();
  private verdicts: Map<string, ResolutionVerdict> | null = null;

  constructor(readonly tariffs: T[]) {
    for (const t of tariffs) {
      // Candidate order is preserved: only the FIRST row claims a text key.
      for (const text of [t.serviceName, t.standardDescription, t.providerDescription]) {
        if (!text) continue;
        const key = normalizeServiceText(text);
        if (!this.firstByNormalisedText.has(key)) this.firstByNormalisedText.set(key, t);
      }
      if (t.cptCode) pushTo(this.byCpt, t.cptCode, t);
      if (t.providerServiceCode) pushTo(this.byProviderCode, t.providerServiceCode, t);
    }
  }

  select(line: LineMatchKey): { tariff: T; method: TariffMatchMethod } | null {
    const coded = new Map<string, T>();
    if (line.cptCode) for (const t of this.byCpt.get(line.cptCode) ?? []) coded.set(t.id, t);
    if (line.providerServiceCode) for (const t of this.byProviderCode.get(line.providerServiceCode) ?? []) coded.set(t.id, t);
    if (coded.size > 0) {
      // Same comparator as the engine; a total order, so the input order of
      // the de-duplicated set cannot change the winner.
      const winner = [...coded.values()].sort(compareTariffPrecedenceWithBranch)[0];
      return { tariff: winner, method: "CODE" };
    }
    const hit = this.firstByNormalisedText.get(normalizeServiceText(line.description));
    return hit ? { tariff: hit, method: "DESCRIPTION" } : null;
  }

  /** The engine's selection for a line that carries exactly this row's service. */
  selectForRow(t: T): { tariff: T; method: TariffMatchMethod } {
    // A row always matches itself, so this is never null.
    return this.select({ cptCode: t.cptCode, providerServiceCode: t.providerServiceCode, description: t.serviceName })!;
  }

  /** Per-row verdicts for the whole candidate set (computed once, cached). */
  verdictMap(): Map<string, ResolutionVerdict> {
    if (this.verdicts) return this.verdicts;

    const choice = new Map<string, { tariff: T; method: TariffMatchMethod }>();
    const groups = new Map<string, T[]>(); // engine-chosen id → rows resolving to it
    for (const t of this.tariffs) {
      const c = this.selectForRow(t);
      choice.set(t.id, c);
      pushTo(groups, c.tariff.id, t);
    }

    const verdicts = new Map<string, ResolutionVerdict>();
    for (const t of this.tariffs) {
      const c = choice.get(t.id)!;
      const group = groups.get(c.tariff.id) ?? [t];
      const groupIds = group.map(g => g.id).filter(id => id !== t.id);
      let status: ResolutionStatus;
      if (c.tariff.id !== t.id) {
        status = "SHADOWED";
      } else {
        const terms = pricingTermsKey(t);
        status = group.every(g => pricingTermsKey(g) === terms) ? "SELECTABLE" : "AMBIGUOUS";
      }
      verdicts.set(t.id, { tariffId: t.id, status, engineTariffId: c.tariff.id, method: c.method, groupTariffIds: groupIds });
    }
    this.verdicts = verdicts;
    return verdicts;
  }

  verdict(tariffId: string): ResolutionVerdict | undefined {
    return this.verdictMap().get(tariffId);
  }

  /**
   * Rows that share ANY normalised description key — `serviceName`,
   * `standardDescription` or `providerDescription`.
   *
   * `verdictMap` answers the portal question (a portal line always carries the
   * row's own `serviceName`). This answers the adjudication question for every
   * other rail: an HMS or CSV line carries the facility's raw text, and the
   * engine matches it against all three fields, first row wins. Two rows that
   * share any key at different prices are therefore an adjudication hazard even
   * when their service names differ.
   */
  textKeyGroups(): Array<{ key: string; rows: T[]; samePricing: boolean }> {
    const byKey = new Map<string, T[]>();
    for (const t of this.tariffs) {
      const keys = new Set(
        [t.serviceName, t.standardDescription, t.providerDescription]
          .filter((s): s is string => !!s)
          .map(normalizeServiceText),
      );
      for (const key of keys) pushTo(byKey, key, t);
    }
    return [...byKey.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, rows, samePricing: new Set(rows.map(pricingTermsKey)).size === 1 }));
  }
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
