import "server-only";

/**
 * Family Hospital UAT plan P02.03 / P02.04 — the provider's own price list, as
 * the capture forms search it and as the submit path re-validates it.
 *
 * FH-02: the forms used to price from the global CPT reference table (KES
 * reference costs, shown as UGX). This service reads ONLY the rows the contract
 * engine would price a line from — `loadCandidateTariffs` for the resolved
 * contract, branch, payer and service date — and never `CPTCode.averageCost`.
 *
 * Parity with adjudication is by construction: the same candidate rows, and a
 * row is offered for selection only when the engine, given that row's own name
 * and codes, would select THAT row at THAT price (`TariffResolutionIndex`). A
 * row the engine cannot tell apart from a differently-priced one is shown but
 * not selectable — the first row is never chosen (P02.03 step 5).
 *
 * Search results are a display hint. `canonicalizeLines` re-reads every
 * selected tariff from the database at submit and takes the service name,
 * category, codes, contracted rate and currency from the row — never from the
 * browser (P02.04).
 */
import { Prisma, type ClaimLineCategory, type ProviderTariff, type ServiceCategory } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { parseMoney, toCanonicalMoney } from "@/lib/money";
import {
  CLAIM_LINE_CATEGORY_LABELS,
  isClaimLineCategory,
  lineCategoryForTaxonomy,
  taxonomyChain,
} from "@/lib/claim-line-category";
import {
  CATALOGUE_DEFAULT_LIMIT,
  CATALOGUE_MAX_LIMIT,
  CATALOGUE_MIN_QUERY,
  lineFieldKey,
  type CaptureLineInput,
  type ServiceSearchResult,
  type ServiceSearchRow,
} from "@/lib/provider-capture-contract";
import {
  loadCandidateTariffs,
  normalizeServiceText,
  TariffResolutionIndex,
  type ResolutionVerdict,
} from "./contract-engine/tariff-selection";
import { recordedUnitFromNotes, unitOfMeasureLabel } from "@/lib/tariff-display";
import { unlistedPolicyFor, type TrustedCaseContext } from "./provider-case-context.service";
import { captureEvent } from "./capture-telemetry";

/** Rate types whose `agreedRate` IS the contracted unit price the engine applies. */
const UNIT_PRICED_RATE_TYPES = new Set(["FIXED", "PER_DIEM"]);

const SEARCHES_PER_MINUTE = 120;

interface IndexedRow {
  tariff: ProviderTariff;
  normalizedName: string;
  lineCategory: ClaimLineCategory;
  taxonomyName: string | null;
  verdict: ResolutionVerdict;
  selectable: boolean;
  unavailableReason: string | null;
}

interface CatalogueIndex {
  rows: IndexedRow[];
  byId: Map<string, IndexedRow>;
  currency: string | null;
  builtAt: number;
}

function unavailableReasonFor(t: ProviderTariff, verdict: ResolutionVerdict, currency: string | null): string | null {
  if (verdict.status === "SHADOWED") {
    return "Listed more than once in your price list, so it cannot be priced automatically. Medvex has been told.";
  }
  if (verdict.status === "AMBIGUOUS") {
    return "Appears more than once in your price list with different prices, so it cannot be priced automatically. Medvex has been told.";
  }
  if (t.rateMissing) return "No price is recorded for this service.";
  if (!UNIT_PRICED_RATE_TYPES.has(t.rateType)) return "Priced by a contract rule rather than a unit rate; enter it as not listed.";
  if (!currency || t.currency.toUpperCase() !== currency.toUpperCase()) return "Priced in a different currency from this contract.";
  return null;
}

function buildIndex(tariffs: ProviderTariff[], categories: ServiceCategory[], currency: string | null): CatalogueIndex {
  const taxonomyById = new Map(categories.map((c) => [c.id, c]));
  const resolution = new TariffResolutionIndex(tariffs);
  const verdicts = resolution.verdictMap();
  const rows: IndexedRow[] = tariffs.map((t) => {
    const chain = taxonomyChain(taxonomyById, t.serviceCategoryId);
    const verdict = verdicts.get(t.id)!;
    const reason = unavailableReasonFor(t, verdict, currency);
    return {
      tariff: t,
      normalizedName: normalizeServiceText(t.serviceName),
      lineCategory: lineCategoryForTaxonomy(chain).category,
      taxonomyName: chain[0]?.name ?? null,
      verdict,
      selectable: reason === null,
      unavailableReason: reason,
    };
  });
  return { rows, byId: new Map(rows.map((r) => [r.tariff.id, r])), currency, builtAt: Date.now() };
}

// A short-lived, per-instance index: a display cache, never authority (submit
// rebuilds from the database). Keyed by everything that changes the engine's
// candidate set.
const INDEX_TTL_MS = 60_000;
const MAX_CACHED = 50;
const indexCache = new Map<string, CatalogueIndex>();

function cacheKey(c: TrustedCaseContext): string {
  return [c.contractId, c.contractVersionId, c.branchId, c.clientId ?? "", c.serviceDateIso].join("|");
}

async function loadIndex(c: TrustedCaseContext, opts: { fresh: boolean }): Promise<CatalogueIndex> {
  const key = cacheKey(c);
  const cached = indexCache.get(key);
  if (!opts.fresh && cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return cached;
  const [tariffs, categories] = await Promise.all([
    loadCandidateTariffs(prisma, { contractId: c.contractId!, pricingDate: c.serviceDate, providerBranchId: c.branchId, clientId: c.clientId }),
    prisma.serviceCategory.findMany({ where: { tenantId: c.tenantId } }),
  ]);
  const index = buildIndex(tariffs, categories, c.currency);
  const blocked = index.rows.filter((r) => r.verdict.status !== "SELECTABLE");
  if (blocked.length > 0) {
    captureEvent("catalogue_ambiguity", { tenantId: c.tenantId, providerId: c.providerId, contractId: c.contractId, count: blocked.length });
  }
  if (indexCache.size >= MAX_CACHED) indexCache.delete(indexCache.keys().next().value as string);
  indexCache.set(key, index);
  return index;
}

/** Test hook. */
export function resetCatalogueCache(): void {
  indexCache.clear();
}

function toRow(r: IndexedRow): ServiceSearchRow {
  const t = r.tariff;
  const unit = [unitOfMeasureLabel(t.unitOfMeasure), recordedUnitFromNotes(t.notes)].filter(Boolean).join(" · ");
  return {
    tariffId: t.id,
    serviceName: t.serviceName,
    providerServiceCode: t.providerServiceCode,
    cptCode: t.cptCode,
    category: r.lineCategory,
    taxonomyName: r.taxonomyName,
    unitRate: toCanonicalMoney(t.agreedRate),
    currency: t.currency,
    unitLabel: unit || null,
    requiresPreauth: t.requiresPreauth,
    effectiveFrom: t.effectiveFrom.toISOString().slice(0, 10),
    selectable: r.selectable,
    unavailableReason: r.unavailableReason,
  };
}

/** Ranking: whole-name prefix, then word prefix, then substring; then name, then id. */
function rankOf(r: IndexedRow, nq: string, firstToken: string): number {
  if (r.normalizedName.startsWith(nq)) return 0;
  if (r.normalizedName.split(" ").some((w) => w.startsWith(firstToken))) return 1;
  return 2;
}

export function searchIndex(
  index: CatalogueIndex,
  category: ClaimLineCategory,
  query: string,
  limit: number,
  offset: number,
): Extract<ServiceSearchResult, { ok: true }> {
  const nq = normalizeServiceText(query);
  const tokens = nq.split(" ").filter(Boolean);
  const codeQuery = query.trim().toUpperCase();
  const matches = (r: IndexedRow) =>
    tokens.every((tok) => r.normalizedName.includes(tok)) ||
    (codeQuery.length >= CATALOGUE_MIN_QUERY &&
      ((r.tariff.cptCode?.toUpperCase().startsWith(codeQuery) ?? false) ||
        (r.tariff.providerServiceCode?.toUpperCase().startsWith(codeQuery) ?? false)));

  const all = index.rows.filter(matches);
  const inCategory = all
    .filter((r) => r.lineCategory === category)
    .sort(
      (a, b) =>
        rankOf(a, nq, tokens[0] ?? "") - rankOf(b, nq, tokens[0] ?? "") ||
        a.tariff.serviceName.localeCompare(b.tariff.serviceName, "en") ||
        (a.tariff.id < b.tariff.id ? -1 : 1),
    );
  const page = inCategory.slice(offset, offset + limit);
  const otherCategoryMatches: Array<{ category: ClaimLineCategory; count: number }> = [];
  if (inCategory.length === 0) {
    const counts = new Map<ClaimLineCategory, number>();
    for (const r of all) counts.set(r.lineCategory, (counts.get(r.lineCategory) ?? 0) + 1);
    for (const [c, n] of counts) otherCategoryMatches.push({ category: c, count: n });
    otherCategoryMatches.sort((a, b) => b.count - a.count);
  }
  return { ok: true, rows: page.map(toRow), total: inCategory.length, hasMore: offset + page.length < inCategory.length, otherCategoryMatches };
}

// ─── Submit-time canonicalisation (P02.04) ───────────────────────────────────

export interface CanonicalLine {
  serviceCategory: ClaimLineCategory;
  description: string;
  cptCode: string | null;
  quantity: number;
  /** What the facility bills per unit (canonical decimal text). */
  unitCost: string;
  /** quantity × unitCost, rounded to 2 dp (canonical decimal text). */
  billedAmount: string;
  /** Capture provenance: the tariff row the user selected, re-read here. */
  selectedProviderTariffId: string | null;
  /** The contracted unit rate captured from that row (canonical decimal text). */
  tariffRate: string | null;
  currency: string | null;
  unlisted: boolean;
}

export type CanonicalizeResult =
  | { ok: true; lines: CanonicalLine[]; totalBilled: string; currency: string | null }
  | { ok: false; message: string; fieldErrors: Record<string, string> };

/**
 * P04.02 — a stored line of the claim being corrected or resubmitted, read by
 * the server (never from the request). An unchanged line that is not linked
 * to the price list is carried exactly as it was: its description, codes and
 * billed price are not re-priced or replaced (plan P04.02 steps 2–3).
 */
export interface CarriedLine {
  lineNumber: number;
  serviceCategory: ClaimLineCategory;
  description: string;
  cptCode: string | null;
  quantity: number;
  unitCost: Prisma.Decimal | string;
  selectedProviderTariffId: string | null;
}

const sameText = (a: string, b: string) => a.trim().replace(/\s+/g, " ") === b.trim().replace(/\s+/g, " ");

const HTML_RE = /<\s*[a-zA-Z/!]/;

export const ProviderServiceCatalogService = {
  /**
   * Type-ahead search within one category of the facility's price list.
   * `context` must come from `ProviderCaseContextService.reconstruct`.
   */
  async search(
    context: TrustedCaseContext | null,
    input: { category: unknown; query: unknown; limit?: unknown; offset?: unknown },
    correlationId: string = randomUUID(),
  ): Promise<ServiceSearchResult> {
    if (!context || !context.contractId) {
      return { ok: false, code: "CONTEXT_INVALID", message: "Find the member again, then search.", correlationId };
    }
    if (!context.catalogueEnabled) {
      return { ok: false, code: "CATALOGUE_DISABLED", message: "Price-list search is not switched on for your facility yet. Enter the service as not listed.", correlationId };
    }
    if (!isClaimLineCategory(input.category)) {
      return { ok: false, code: "CONTEXT_INVALID", message: "Choose a category first.", correlationId };
    }
    const query = typeof input.query === "string" ? input.query.slice(0, 120) : "";
    if (normalizeServiceText(query).replace(/ /g, "").length < CATALOGUE_MIN_QUERY) {
      return { ok: false, code: "TOO_SHORT", message: `Type at least ${CATALOGUE_MIN_QUERY} letters or digits.`, correlationId };
    }

    const limited = rateLimit(`catalogue:${context.actorId}`, SEARCHES_PER_MINUTE, 60_000);
    if (!limited.allowed) {
      captureEvent("catalogue_throttled", { correlationId, tenantId: context.tenantId, providerId: context.providerId, actorId: context.actorId });
      // Abnormal enumeration is audited — once per window, not per keystroke.
      if (rateLimit(`catalogue-audit:${context.actorId}`, 1, 60_000).allowed) {
        await prisma.auditLog
          .create({
            data: {
              userId: context.actorId,
              tenantId: context.tenantId,
              action: "PROVIDER_CATALOGUE_SEARCH_THROTTLED",
              module: "PROVIDERS",
              entityType: "Provider",
              entityId: context.providerId,
              description: `Tariff search throttled after ${SEARCHES_PER_MINUTE} searches in a minute`,
              metadata: { correlationId, limitPerMinute: SEARCHES_PER_MINUTE },
            },
          })
          .catch(() => undefined);
      }
      return { ok: false, code: "THROTTLED", message: `Too many searches. Try again in ${limited.retryAfterSeconds} seconds.`, correlationId };
    }

    const limit = Math.min(Math.max(1, Number.parseInt(String(input.limit ?? CATALOGUE_DEFAULT_LIMIT), 10) || CATALOGUE_DEFAULT_LIMIT), CATALOGUE_MAX_LIMIT);
    const offset = Math.max(0, Number.parseInt(String(input.offset ?? 0), 10) || 0);
    try {
      const index = await loadIndex(context, { fresh: false });
      return searchIndex(index, input.category, query, limit, offset);
    } catch {
      captureEvent("catalogue_search_failed", { correlationId, tenantId: context.tenantId, providerId: context.providerId });
      return { ok: false, code: "UNAVAILABLE", message: "Price-list search is temporarily unavailable. Try again shortly.", correlationId };
    }
  },

  /**
   * P02.04 — turn submitted lines into canonical lines, or field errors.
   *
   * A selected tariff id is re-read from the engine's candidate set for the
   * FRESHLY resolved case (not the cache). Stale, inactive, expired, foreign,
   * wrong-category or wrong-currency ids are rejected with "select the service
   * again". Name, category, codes, contracted rate and currency come from the
   * row; the facility's billed price and quantity are validated and preserved.
   */
  async canonicalizeLines(
    context: TrustedCaseContext,
    lines: CaptureLineInput[],
    opts: { carried?: { currency: string | null; lines: CarriedLine[] } } = {},
  ): Promise<CanonicalizeResult> {
    const fieldErrors: Record<string, string> = {};
    const carried = new Map((opts.carried?.lines ?? []).map((l) => [l.lineNumber, l]));
    if (!Array.isArray(lines) || lines.length === 0) {
      return { ok: false, message: "Add at least one service line.", fieldErrors: { lines: "Add at least one service line." } };
    }
    if (lines.length > 200) {
      return { ok: false, message: "A claim can carry at most 200 lines.", fieldErrors: { lines: "Too many lines." } };
    }

    const needsCatalogue = lines.some((l) => typeof l?.selectedProviderTariffId === "string" && l.selectedProviderTariffId);
    const index = context.contractId && (needsCatalogue || context.catalogueEnabled) ? await loadIndex(context, { fresh: true }) : null;
    const policy = unlistedPolicyFor(context.unlistedServiceRule, context.unlistedDiscountPct);
    const canonical: CanonicalLine[] = [];
    let total = new Prisma.Decimal(0);

    lines.forEach((line, i) => {
      const qtyRaw = typeof line?.quantity === "number" ? String(line.quantity) : String(line?.quantity ?? "").trim();
      const quantity = /^\d{1,6}$/.test(qtyRaw) ? Number.parseInt(qtyRaw, 10) : NaN;
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
        fieldErrors[lineFieldKey(i, "quantity")] = "Enter a whole number of units (1 or more).";
      }
      const price = parseMoney(line?.billedUnitPrice ?? "");
      if (!price.ok) {
        fieldErrors[lineFieldKey(i, "billedUnitPrice")] = price.message;
      } else if (price.value.lte(0)) {
        fieldErrors[lineFieldKey(i, "billedUnitPrice")] = "Enter a price greater than zero.";
      }
      if (!isClaimLineCategory(line?.serviceCategory)) {
        fieldErrors[lineFieldKey(i, "category")] = "Choose a category.";
        return;
      }

      const tariffId = typeof line.selectedProviderTariffId === "string" && line.selectedProviderTariffId ? line.selectedProviderTariffId : null;

      // P04.02 — the earlier claim's line, carried as it was when it really is
      // unchanged. Anything edited is judged below like any other line.
      const prior = !tariffId && typeof line.historicalLineNumber === "number" ? carried.get(line.historicalLineNumber) : undefined;
      if (prior && prior.selectedProviderTariffId === null) {
        const sameCurrency = !!context.currency && (opts.carried?.currency ?? "").toUpperCase() === context.currency.toUpperCase();
        const unchanged =
          prior.serviceCategory === line.serviceCategory &&
          sameText(prior.description, typeof line.description === "string" ? line.description : "") &&
          quantity === prior.quantity &&
          price.ok &&
          price.value.eq(new Prisma.Decimal(prior.unitCost.toString()));
        if (unchanged && !sameCurrency) {
          fieldErrors[lineFieldKey(i, "billedUnitPrice")] =
            `The earlier claim was billed in ${opts.carried?.currency ?? "another currency"}; this claim is in ${context.currency ?? "the contract's currency"}. Enter this line's price again.`;
          return;
        }
        if (unchanged && price.ok) {
          const billed = new Prisma.Decimal(quantity).times(price.value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          total = total.plus(billed);
          canonical.push({
            serviceCategory: prior.serviceCategory,
            description: prior.description,
            cptCode: prior.cptCode,
            quantity,
            unitCost: toCanonicalMoney(price.value),
            billedAmount: toCanonicalMoney(billed),
            selectedProviderTariffId: null,
            tariffRate: null,
            currency: context.currency,
            unlisted: true,
          });
          return;
        }
      }

      if (tariffId) {
        const row = index?.byId.get(tariffId);
        const reject = (message: string, code: string) => {
          fieldErrors[lineFieldKey(i, "service")] = message;
          captureEvent("stale_tariff_rejected", { tenantId: context.tenantId, providerId: context.providerId, tariffId, code });
        };
        if (!context.catalogueEnabled || !index) return reject("Price-list search is not switched on for your facility. Enter the service as not listed.", "CATALOGUE_DISABLED");
        if (!row) return reject("This service is no longer on your price list for this date. Select the service again.", "NOT_IN_SCOPE");
        if (!row.selectable) return reject(`${row.unavailableReason ?? "This service cannot be priced automatically."} Select the service again.`, row.verdict.status);
        if (row.lineCategory !== line.serviceCategory) {
          return reject(`This service is listed under ${CLAIM_LINE_CATEGORY_LABELS[row.lineCategory]}. Choose that category and select the service again.`, "WRONG_CATEGORY");
        }
        if (!context.currency || row.tariff.currency.toUpperCase() !== context.currency.toUpperCase()) {
          return reject("This service is priced in a different currency from the contract. Select the service again.", "WRONG_CURRENCY");
        }
        if (!price.ok || !Number.isInteger(quantity)) return;
        const billed = new Prisma.Decimal(quantity).times(price.value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        total = total.plus(billed);
        canonical.push({
          serviceCategory: row.lineCategory,
          description: row.tariff.serviceName,
          cptCode: row.tariff.cptCode,
          quantity,
          unitCost: toCanonicalMoney(price.value),
          billedAmount: toCanonicalMoney(billed),
          selectedProviderTariffId: row.tariff.id,
          tariffRate: toCanonicalMoney(row.tariff.agreedRate),
          currency: row.tariff.currency.toUpperCase(),
          unlisted: false,
        });
        return;
      }

      // An unlisted, description-first line (DEC-FH-01).
      if (!policy.allowed) {
        fieldErrors[lineFieldKey(i, "service")] = context.contractId
          ? "This contract does not pay for services outside the price list. Select a service from the list."
          : "No active contract covers this patient here, so services cannot be captured.";
        return;
      }
      const description = typeof line.description === "string" ? line.description.trim().replace(/\s+/g, " ") : "";
      if (!description) {
        fieldErrors[lineFieldKey(i, "description")] = "Describe the service.";
        return;
      }
      if (description.length > 500 || HTML_RE.test(description) || /javascript:/i.test(description)) {
        fieldErrors[lineFieldKey(i, "description")] = "Use plain text of up to 500 characters.";
        return;
      }
      if (index && context.catalogueEnabled) {
        const typed = normalizeServiceText(description);
        const listed = index.rows.find((r) => r.selectable && r.normalizedName === typed);
        if (listed) {
          fieldErrors[lineFieldKey(i, "service")] = "This service is on your price list — select it from the list so the contracted rate applies.";
          return;
        }
      }
      if (!price.ok || !Number.isInteger(quantity)) return;
      const billed = new Prisma.Decimal(quantity).times(price.value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      total = total.plus(billed);
      canonical.push({
        serviceCategory: line.serviceCategory,
        description,
        cptCode: null,
        quantity,
        unitCost: toCanonicalMoney(price.value),
        billedAmount: toCanonicalMoney(billed),
        selectedProviderTariffId: null,
        tariffRate: null,
        currency: context.currency,
        unlisted: true,
      });
    });

    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, message: "Some service lines need correcting.", fieldErrors };
    }
    return { ok: true, lines: canonical, totalBilled: toCanonicalMoney(total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)), currency: context.currency };
  },
} as const;
