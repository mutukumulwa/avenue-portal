/**
 * PNOS F4.1 — clinical information-request catalog.
 *
 * The closed set of item types a reviewer can request from a provider on a
 * pre-authorization. Pure + deterministic so the open service (F4.2) can validate
 * a request and the UI (F4.7) can render labels without a DB round-trip. Codes are
 * stable identifiers; labels/descriptions are provider-facing copy.
 */
export interface InfoRequestItem {
  code: string;
  label: string;
  description: string;
}

export const INFO_REQUEST_ITEMS: readonly InfoRequestItem[] = [
  { code: "CLINICAL_NOTES", label: "Clinical notes", description: "Consultation or progress notes supporting the request." },
  { code: "LAB_RESULTS", label: "Laboratory results", description: "Relevant lab reports (e.g. FBC, cultures, panels)." },
  { code: "IMAGING_REPORTS", label: "Imaging reports", description: "Radiology / imaging reports (X-ray, ultrasound, CT, MRI)." },
  { code: "REFERRAL_LETTER", label: "Referral letter", description: "Referring clinician's letter, where applicable." },
  { code: "TREATMENT_PLAN", label: "Treatment plan", description: "Proposed plan of care, duration and expected outcomes." },
  { code: "ITEMIZED_QUOTE", label: "Itemized quote", description: "Line-item cost breakdown for the requested service." },
  { code: "PRIOR_HISTORY", label: "Prior medical history", description: "Relevant past history for the presenting condition." },
  { code: "OTHER", label: "Other", description: "Any other supporting information named in the request." },
] as const;

const CODES = new Set(INFO_REQUEST_ITEMS.map((i) => i.code));

export function isValidInfoRequestItem(code: string): boolean {
  return CODES.has(code);
}

/**
 * Normalize a caller-supplied list of requested-item codes: upcase/trim, keep only
 * known catalog codes, de-duplicate, preserve first-seen order. Unknown codes are
 * dropped (never persisted). Returns [] for junk — the open service rejects an
 * empty result so a request always names at least one concrete item.
 */
export function normalizeRequestedItems(codes: unknown): string[] {
  if (!Array.isArray(codes)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of codes) {
    if (typeof raw !== "string") continue;
    const code = raw.trim().toUpperCase();
    if (!CODES.has(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function infoRequestItemLabel(code: string): string {
  return INFO_REQUEST_ITEMS.find((i) => i.code === code)?.label ?? code;
}
