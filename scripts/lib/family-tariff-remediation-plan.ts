/**
 * Family Hospital UAT plan P01.02 — the pure planner behind
 * scripts/family-hospital-tariff-remediation.ts.
 *
 * Input: the contract engine's candidate tariff set for Family's context.
 * Output: a manifest that resolves every group of rows the engine cannot tell
 * apart (they share a normalised description key), by explicit rules — never by
 * row order:
 *
 *   EQUIVALENT_DUPLICATE  same pricing terms → keep the row the engine already
 *                         selects (adjudication behaviour unchanged); deactivate
 *                         the rest. No price moves.
 *   DISTINCT_BY_UNIT      different prices AND different recorded units (the
 *                         facility's "Unit" column, loaded into `notes` as
 *                         "Unit: X") → different products. Replace each with a
 *                         name that carries its unit. The lower-price rule must
 *                         NOT be applied: it would pay a tablet price for a vial.
 *   DISTINCT_BY_SYMBOL    different prices, and the names differ only in "<"/">",
 *                         which the engine's normaliser discards → different
 *                         services. Replace with the symbols written as words.
 *   TRUE_DUPLICATE        different prices, same service → the facility's
 *                         confirmed rule: keep the LOWER price, deactivate the rest.
 *   UNRESOLVED            anything else (e.g. equal rates but other terms differ).
 *                         The manifest is not applicable; a human decides.
 *
 * No database access here: the CLI loads rows and applies the manifest.
 */
import { createHash } from "node:crypto";
import {
  normalizeServiceText,
  pricingTermsKey,
  TariffResolutionIndex,
  type AnalysableTariff,
} from "../../src/server/services/contract-engine/tariff-selection";

export const REMEDIATION_KIND = "FH_P01_02_REMEDIATION";

export type Disposition = "EQUIVALENT_DUPLICATE" | "DISTINCT_BY_UNIT" | "DISTINCT_BY_SYMBOL" | "TRUE_DUPLICATE" | "UNRESOLVED";

/** The fields a remediation row needs beyond what selection reads. */
export interface RemediationTariff extends AnalysableTariff {
  providerId: string;
  versionId: string | null;
  serviceCategoryId: string | null;
  unitOfMeasure: string;
  notes: string | null;
  effectiveTo: Date | null;
}

export interface Replacement {
  /** The row being superseded. */
  supersedesId: string;
  serviceName: string;
  providerDescription: string;
  fingerprint: string;
}

export interface GroupPlan {
  key: string;
  disposition: Disposition;
  reason: string;
  rows: Array<{ id: string; serviceName: string; agreedRate: string; unit: string | null; categoryId: string | null; sourceFingerprint: string }>;
  /** Rows that stay active unchanged. */
  keepIds: string[];
  /** Rows to deactivate (never delete). */
  deactivateIds: string[];
  replacements: Replacement[];
}

export interface RemediationManifest {
  batchRef: string;
  contractId: string;
  currency: string;
  taxInclusive: string;
  groups: GroupPlan[];
  totals: {
    candidateRows: number;
    groups: number;
    deactivate: number;
    create: number;
    activeAfter: number;
    logicalServicesAfter: number;
    unresolvedGroups: number;
  };
  /** Result of re-running the resolution analysis on the simulated post-state. */
  postStateCheck: { selectable: number; shadowed: number; ambiguous: number; descriptionKeyCollisions: number };
  /** SHA-256 of the canonical manifest content — what the reviewer signs and `--apply` must quote. */
  manifestHash: string;
}

/** "Unit: Vial" → "Vial" (the load wrote the facility's Unit column this way). */
export function recordedUnit(notes: string | null): string | null {
  const m = notes?.match(/(?:^|;|\s)Unit:\s*([^;]+?)\s*(?:;|$)/i);
  return m ? m[1].trim() : null;
}

/** "<" and ">" as words, so the engine's normaliser keeps them apart. */
export function spellComparisonSymbols(name: string): string {
  return name
    .replace(/\s*<\s*/g, (m) => `${m.startsWith(" ") ? " " : ""}less than `)
    .replace(/\s*>\s*/g, (m) => `${m.startsWith(" ") ? " " : ""}more than `)
    .replace(/\(\s+/g, "(")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function fingerprint(batchRef: string, t: RemediationTariff, newName: string): string {
  const canonical = JSON.stringify({
    batchRef,
    providerId: t.providerId,
    contractId: t.contractId,
    versionId: t.versionId,
    supersedes: t.id,
    serviceName: newName,
    agreedRate: t.agreedRate.toString(),
    currency: t.currency,
    unit: recordedUnit(t.notes),
    serviceCategoryId: t.serviceCategoryId,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Content fingerprint of a source row: what it says, not where it sits. */
export function sourceRowFingerprint(t: RemediationTariff): string {
  return createHash("sha256")
    .update(JSON.stringify([t.providerId, t.contractId, t.serviceName, t.agreedRate.toString(), t.currency, recordedUnit(t.notes), t.serviceCategoryId]))
    .digest("hex");
}

function describeRow(t: RemediationTariff) {
  return {
    id: t.id,
    serviceName: t.serviceName,
    agreedRate: t.agreedRate.toString(),
    unit: recordedUnit(t.notes),
    categoryId: t.serviceCategoryId,
    sourceFingerprint: sourceRowFingerprint(t),
  };
}

/**
 * Plan the remediation for a candidate set in engine order
 * (`loadCandidateTariffs` order).
 */
export function planTariffRemediation(input: {
  batchRef: string;
  contractId: string;
  currency: string;
  taxInclusive: string;
  candidates: RemediationTariff[];
}): RemediationManifest {
  const { batchRef, candidates } = input;
  const index = new TariffResolutionIndex(candidates);
  const groups: GroupPlan[] = [];
  const handled = new Set<string>();

  // Groups by ANY shared description key; merge overlapping groups so one row
  // is planned exactly once.
  const rawGroups = index.textKeyGroups();
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let r = id;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const g of rawGroups) {
    for (const r of g.rows) if (!parent.has(r.id)) parent.set(r.id, r.id);
    const root = find(g.rows[0].id);
    for (const r of g.rows.slice(1)) parent.set(find(r.id), root);
  }
  const merged = new Map<string, RemediationTariff[]>();
  const byId = new Map(candidates.map((t) => [t.id, t]));
  for (const id of parent.keys()) {
    const root = find(id);
    merged.set(root, [...(merged.get(root) ?? []), byId.get(id)!]);
  }
  // Candidate order inside each group (engine order), groups ordered by first row.
  const order = new Map(candidates.map((t, i) => [t.id, i]));
  const mergedGroups = [...merged.values()]
    .map((rows) => rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!))
    .sort((a, b) => order.get(a[0].id)! - order.get(b[0].id)!);

  for (const rows of mergedGroups) {
    rows.forEach((r) => handled.add(r.id));
    const key = normalizeServiceText(rows[0].serviceName);
    const described = rows.map(describeRow);
    const samePricing = new Set(rows.map(pricingTermsKey)).size === 1;

    if (samePricing) {
      // Keep the engine's current pick: the first row in candidate order.
      groups.push({
        key,
        disposition: "EQUIVALENT_DUPLICATE",
        reason: "Same pricing terms; keep the row the engine already selects so adjudication is unchanged.",
        rows: described,
        keepIds: [rows[0].id],
        deactivateIds: rows.slice(1).map((r) => r.id),
        replacements: [],
      });
      continue;
    }

    const units = rows.map((r) => recordedUnit(r.notes));
    const unitsDistinct = units.every((u) => u) && new Set(units.map((u) => u!.toLowerCase())).size === rows.length;
    if (unitsDistinct) {
      const replacements = rows.map((r) => {
        const name = `${r.serviceName} (${recordedUnit(r.notes)})`;
        return { supersedesId: r.id, serviceName: name, providerDescription: name, fingerprint: fingerprint(batchRef, r, name) };
      });
      groups.push({
        key,
        disposition: "DISTINCT_BY_UNIT",
        reason: "Different prices and different recorded units: different products. Names now carry the unit; the lower-price rule does not apply.",
        rows: described,
        keepIds: [],
        deactivateIds: rows.map((r) => r.id),
        replacements,
      });
      continue;
    }

    const spelled = rows.map((r) => spellComparisonSymbols(r.serviceName));
    const symbolsMatter =
      rows.some((r) => /[<>]/.test(r.serviceName)) && new Set(spelled.map(normalizeServiceText)).size === rows.length;
    if (symbolsMatter) {
      const replacements = rows.map((r, i) => ({
        supersedesId: r.id,
        serviceName: spelled[i],
        providerDescription: spelled[i],
        fingerprint: fingerprint(batchRef, r, spelled[i]),
      }));
      groups.push({
        key,
        disposition: "DISTINCT_BY_SYMBOL",
        reason: 'Names differ only in "<"/">", which the engine discards: different services. Symbols written as words.',
        rows: described,
        keepIds: [],
        deactivateIds: rows.map((r) => r.id),
        replacements,
      });
      continue;
    }

    // Same service at different prices: the facility's rule (lower price) — but
    // only when the rows differ in price and nothing else that pays differently.
    const withoutRate = (r: RemediationTariff) => pricingTermsKey({ ...r, agreedRate: "0" });
    const onlyRateDiffers = new Set(rows.map(withoutRate)).size === 1;
    const rates = rows.map((r) => r.agreedRate.toString());
    const minRate = rows.reduce((m, r) => (compareDecimalText(r.agreedRate.toString(), m.agreedRate.toString()) < 0 ? r : m), rows[0]);
    const lowestIsUnique = rates.filter((x) => compareDecimalText(x, minRate.agreedRate.toString()) === 0).length === 1;
    if (onlyRateDiffers && lowestIsUnique) {
      groups.push({
        key,
        disposition: "TRUE_DUPLICATE",
        reason: "Same service at different prices; facility rule (2026-08-29, reconfirmed 2026-09-10): use the lower price.",
        rows: described,
        keepIds: [minRate.id],
        deactivateIds: rows.filter((r) => r.id !== minRate.id).map((r) => r.id),
        replacements: [],
      });
      continue;
    }

    groups.push({
      key,
      disposition: "UNRESOLVED",
      reason: "Pricing differs in more than the rate, or the lowest rate is not unique. Needs a human decision.",
      rows: described,
      keepIds: rows.map((r) => r.id),
      deactivateIds: [],
      replacements: [],
    });
  }

  // Simulate the post-state and re-run the same analysis the preflight uses.
  const deactivated = new Set(groups.flatMap((g) => g.deactivateIds));
  const created: RemediationTariff[] = groups.flatMap((g) =>
    g.replacements.map((rep) => {
      const from = byId.get(rep.supersedesId)!;
      return { ...from, id: `new:${rep.fingerprint.slice(0, 16)}`, serviceName: rep.serviceName, providerDescription: rep.providerDescription };
    }),
  );
  const after = [...candidates.filter((t) => !deactivated.has(t.id)), ...created];
  const afterIndex = new TariffResolutionIndex(after);
  const verdicts = [...afterIndex.verdictMap().values()];
  const postStateCheck = {
    selectable: verdicts.filter((v) => v.status === "SELECTABLE").length,
    shadowed: verdicts.filter((v) => v.status === "SHADOWED").length,
    ambiguous: verdicts.filter((v) => v.status === "AMBIGUOUS").length,
    descriptionKeyCollisions: afterIndex.textKeyGroups().length,
  };
  const logicalServicesAfter = verdicts.filter((v) => v.engineTariffId === v.tariffId).length;

  const body = {
    batchRef,
    contractId: input.contractId,
    currency: input.currency,
    taxInclusive: input.taxInclusive,
    groups,
    totals: {
      candidateRows: candidates.length,
      groups: groups.length,
      deactivate: deactivated.size,
      create: created.length,
      activeAfter: after.length,
      logicalServicesAfter,
      unresolvedGroups: groups.filter((g) => g.disposition === "UNRESOLVED").length,
    },
    postStateCheck,
  };
  const manifestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, manifestHash };
}

/** Compare two plain decimal strings without floating point. */
export function compareDecimalText(a: string, b: string): number {
  const norm = (s: string) => {
    const neg = s.startsWith("-");
    const [i, f = ""] = s.replace(/^-/, "").split(".");
    return { neg, i: i.replace(/^0+(?=\d)/, ""), f: f.replace(/0+$/, "") };
  };
  const x = norm(a);
  const y = norm(b);
  if (x.neg !== y.neg) return x.neg ? -1 : 1;
  const sign = x.neg ? -1 : 1;
  if (x.i.length !== y.i.length) return sign * (x.i.length - y.i.length);
  if (x.i !== y.i) return sign * (x.i < y.i ? -1 : 1);
  const len = Math.max(x.f.length, y.f.length);
  const fx = x.f.padEnd(len, "0");
  const fy = y.f.padEnd(len, "0");
  if (fx === fy) return 0;
  return sign * (fx < fy ? -1 : 1);
}
