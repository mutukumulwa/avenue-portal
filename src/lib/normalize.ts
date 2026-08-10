/**
 * SP-3 — normalization + identity keys (kills defect class C3: identity by
 * incidental side-effect instead of a normalized key + a DB unique).
 *
 * These functions produce the DETERMINISTIC keys the uniqueness constraints are
 * built on. `normalizeLegalName` backs `Client.nameNormalized`
 * (`@@unique([operatorTenantId, nameNormalized])`); `normalizePrefix` gates the
 * D3 member-number-prefix format before `@@unique([operatorTenantId,
 * memberNumberPrefix])`. `normalizePhone`/`normalizeNationalId` are provided for
 * the later member-identity wave (M-005/M-006 duplicate detection); they are not
 * consumed by Wave 1.
 */

/**
 * D3 member-number prefix format: an uppercase letter followed by 2–5 more
 * uppercase alphanumerics (3–6 chars total). Existing prefixes MVX / LMU / NWSC
 * all conform. Exported so validation schemas and tests share one source.
 */
export const PREFIX_RE = /^[A-Z][A-Z0-9]{2,5}$/;

/**
 * Normalized legal-name key: Unicode NFKC → trim → collapse internal whitespace
 * runs to a single space → casefold. Two names that differ only by case,
 * padding, internal spacing, or compatible Unicode forms produce the SAME key,
 * so `"Lakeview"`, `" lakeview "`, and `"LAKEVIEW"` all collide on the unique.
 *
 * `toLowerCase()` is the portable casefold approximation (JS has no full Unicode
 * casefold); it is locale-independent and therefore stable as a storage key.
 */
export function normalizeLegalName(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Normalize + validate a member-number prefix (D3).
 *
 * The ONLY transform applied is trim + uppercase — a courtesy so a lowercase
 * `"lmu"` is accepted as `"LMU"`. Anything that does not match {@link PREFIX_RE}
 * AFTER that (whitespace, slash, apostrophe, emoji, formula-like `=SUM(`, …) is
 * REJECTED, never silently rewritten. Returns the canonical uppercase prefix, or
 * `null` when the input is not a valid prefix.
 */
export function normalizePrefix(input: string): string | null {
  const upper = input.trim().toUpperCase();
  return PREFIX_RE.test(upper) ? upper : null;
}

/**
 * Uganda-first E.164 phone key (member wave M-006): `0700…` / `256700…` /
 * `+256700…` all fold to `+256700…`. Returns `null` for anything unparseable.
 * NOT consumed by Wave 1 — provided so the member wave shares one definition.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, "").replace(/^\+/, "");
  let local: string;
  if (/^0\d{9}$/.test(digits)) {
    local = digits.slice(1); // 0700123456 -> 700123456
  } else if (/^256\d{9}$/.test(digits)) {
    local = digits.slice(3); // 256700123456 -> 700123456
  } else {
    return null;
  }
  return `+256${local}`;
}

/**
 * National-ID key (member wave M-005): trim, uppercase, strip internal spaces.
 * So `"ck 12 34"`, `"CK1234"`, and `" ck1234 "` all fold to the same key.
 */
export function normalizeNationalId(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Email key (member wave M-007 — email duplicate detection): trim + casefold.
 * Emails are case-insensitive for identity purposes, so `"A@B.com"` and
 * `" a@b.com "` collide on the same key. Returns "" for blank input.
 */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Every stored representation a Uganda phone number could take, for a duplicate
 * probe that must catch `+256…` / `256…` / `0…` variants of the SAME line even
 * when historical rows were stored un-normalized. Returns the E.164 key first
 * (the form new members are stored in) plus the `256…` and `0…` legacy forms and
 * the raw trimmed input. Empty array when the number is not a parseable UG line
 * (caller then skips the phone dedup for a non-UG/garbage value).
 */
export function ugandaPhoneVariants(input: string): string[] {
  const key = normalizePhone(input); // "+256700123456" or null
  const variants = new Set<string>();
  const raw = input.trim();
  if (raw) variants.add(raw);
  if (key) {
    const local = key.slice(4); // strip "+256"
    variants.add(key); // +256700123456
    variants.add(`256${local}`); // 256700123456
    variants.add(`0${local}`); // 0700123456
  }
  return key ? [...variants] : [];
}
