/**
 * WP-N2 (N-010) — the single, deterministic tariff-precedence order, shared by
 * BOTH resolvers so pricing never depends on DB row order:
 *   - `ProviderContractsService.resolveClaimLineRates` (the legacy claim-rate
 *     resolver), and
 *   - `ContractEngine.evaluateLine` (the contract rule engine).
 *
 * Before this module the legacy resolver sorted by an inline chain while the
 * engine's `findMany` had NO `orderBy` at all — so when two active rows covered
 * the same code over an overlapping window, the two paths could pick different
 * rates. Both now sort with the SAME comparator; the engine additionally honours
 * branch specificity (a dimension the legacy resolver's callers never carry).
 *
 * Order (first wins): client-specific → contract-scoped → tariff-type priority
 * (NEGOTIATED ≺ GAZETTED ≺ PUBLISHED) → latest `effectiveFrom` → `id` (a final
 * stable tie-break so the winner is deterministic even for otherwise-identical
 * rows). Write-time overlap detection (`detectTariffOverlap`) blocks the
 * ambiguity at the source; this comparator is the last line of defence.
 */

/** Priority when several rows cover the same code: negotiated beats gazetted beats published. */
const TARIFF_TYPE_PRIORITY: Record<string, number> = { NEGOTIATED: 0, GAZETTED: 1, PUBLISHED: 2 };

export interface TariffPrecedenceRow {
  id: string;
  clientId: string | null;
  contractId: string | null;
  tariffType: string;
  effectiveFrom: Date;
}

export interface TariffPrecedenceRowWithBranch extends TariffPrecedenceRow {
  branchId: string | null;
}

/** The shared precedence order (client → contract → type → latest → id). */
export function compareTariffPrecedence(a: TariffPrecedenceRow, b: TariffPrecedenceRow): number {
  const aClient = a.clientId ? 0 : 1;
  const bClient = b.clientId ? 0 : 1;
  if (aClient !== bClient) return aClient - bClient;

  const aContract = a.contractId ? 0 : 1;
  const bContract = b.contractId ? 0 : 1;
  if (aContract !== bContract) return aContract - bContract;

  const pa = TARIFF_TYPE_PRIORITY[a.tariffType] ?? 9;
  const pb = TARIFF_TYPE_PRIORITY[b.tariffType] ?? 9;
  if (pa !== pb) return pa - pb;

  const ef = b.effectiveFrom.getTime() - a.effectiveFrom.getTime(); // latest first
  if (ef !== 0) return ef;

  // Final deterministic tie-break: never let the winner depend on row order.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Engine-only precedence: a branch-specific row (branchId set) is more specific
 * than a network-wide one and wins first, then the shared precedence decides.
 */
export function compareTariffPrecedenceWithBranch(
  a: TariffPrecedenceRowWithBranch,
  b: TariffPrecedenceRowWithBranch,
): number {
  const aBranch = a.branchId ? 0 : 1;
  const bBranch = b.branchId ? 0 : 1;
  if (aBranch !== bBranch) return aBranch - bBranch;
  return compareTariffPrecedence(a, b);
}
