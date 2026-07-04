/**
 * PR-008: render pricing rules in operator language instead of raw JSON.
 * Reused by the contract detail Pricing-rules list and the claim-detail
 * contract panel wherever rules are cited. Keep a "view raw" affordance in the
 * UI for support — this function is the human-readable line.
 */

export interface PricingRuleLike {
  ruleKind: string;
  scope?: string | null;
  params?: unknown;
}

function money(n: unknown, currency = "KES"): string {
  const v = Number(n);
  return Number.isFinite(v) ? `${currency} ${v.toLocaleString("en-KE")}` : String(n ?? "—");
}

export function formatPricingRule(rule: PricingRuleLike, currency = "KES"): string {
  const p = (rule.params ?? {}) as Record<string, unknown>;
  const carve = [
    ...((p.carveOutCodes as string[] | undefined) ?? []),
    ...((p.carveOutDescriptions as string[] | undefined) ?? []),
  ];
  const carveNote = carve.length ? ` · carve-outs: ${carve.join(", ")}` : "";
  const label = p.label ? ` — “${p.label}”` : "";

  switch (rule.ruleKind) {
    case "PER_VISIT_CASE_RATE":
      return `Per-visit case rate — ${money(p.rate, currency)} per valid visit${carveNote}${label}`;
    case "CAPITATION":
      return `Capitation — prepaid via pool${p.poolId ? ` ${p.poolId}` : ""}; encounters price at 0${carveNote}${label}`;
    case "AVERAGE_COST_POOL":
      return `Average-cost pool${p.poolId ? ` ${p.poolId}` : ""} — claims tagged for pool reconciliation (reviewer judgement)`;
    case "DISCOUNT_OFF_BILLED":
      return `Discount — ${p.pct ?? p.percentage ?? "?"}% off billed charges${carveNote}`;
    case "MARKUP_OVER_COST":
      return `Cost-plus — billed cost + ${p.pct ?? p.percentage ?? "?"}%`;
    case "PER_DIEM":
      return `Per-diem — ${money(p.rate, currency)} per day of stay${label}`;
    case "PACKAGE":
      return `Package price — ${money(p.rate ?? p.price, currency)} fixed${label}`;
    case "FIXED":
      return `Fixed rate — ${money(p.rate, currency)}${label}`;
    case "MAX_CAP":
      return `Payable ceiling — never more than ${money(p.rate ?? p.cap, currency)}`;
    case "MIN_FLOOR":
      return `Payable floor — never less than ${money(p.rate ?? p.floor, currency)}`;
    case "PER_ADMISSION":
      return `Per admission — ${money(p.rate, currency)}`;
    case "PER_PROCEDURE":
      return `Per procedure — ${money(p.rate, currency)}`;
    case "PER_CONSULTATION":
      return `Per consultation — ${money(p.rate, currency)}`;
    case "PER_ITEM":
      return `Per item — ${money(p.rate, currency)}`;
    case "PER_SESSION":
      return `Per session — ${money(p.rate, currency)}`;
    case "NET_OF_EXTERNAL":
      return `Net of ${p.scheme ?? "external scheme"} — we pay the balance after the external tariff`;
    case "EXTERNAL_TARIFF_REF":
      return `Priced from ${p.scheme ?? "external"} tariff table`;
    case "LOWER_OF":
      return "Pays the lower of the candidate prices";
    case "HIGHER_OF":
      return "Pays the higher of the candidate prices";
    default:
      return `${rule.ruleKind.replace(/_/g, " ").toLowerCase()}${label}`;
  }
}
