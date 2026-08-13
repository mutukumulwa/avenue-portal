/**
 * UAT-HF P11.05 — minimum-necessary member detail (DEF-080, DEC-10).
 *
 * DEF-080 (S2): "Opening a member profile renders, with no interaction at all:
 * the family unit inline ... so a MINOR dependant's full name, member number and
 * age appear on the principal's landing view — together with the national ID,
 * the date of birth, the full unmasked phone number and the financial position.
 * This is the screen an agent has open with a member standing at the counter,
 * and with anyone behind them able to read it."
 *
 * The register also notes what the design already gets right: "Benefits,
 * Dependants, Claims & Pre-Auths, Activity Log and Correspondence each require a
 * deliberate click — which makes the inline household summary the outlier rather
 * than the pattern." So this is not a new policy; it is applying the page's own
 * existing pattern to the two blocks that skipped it.
 *
 * ## The rule that shapes the implementation
 *
 * DEC-10, signed: "Hidden data must never be serialized into client HTML or
 * network payloads 'just to hide it with CSS' — the default operator DOM must
 * not contain the full sensitive fields."
 *
 * That is why these functions return **masks, not flags**. There is no
 * `{ value, hidden: true }` shape anywhere here, because such a shape ends up in
 * the payload and the mask becomes decoration. The full value is fetched by a
 * separate, permission-gated, audited call or it is not available at all.
 */

/** The permission an operator needs to reveal a masked field. */
export const SENSITIVE_REVEAL_PERMISSION = "member.sensitive.reveal";

/** Shown in place of a value the viewer may not see by default. */
export const MASKED_PLACEHOLDER = "••••••";

/**
 * Mask a national ID, keeping only the last two characters.
 *
 * Enough to confirm a document someone is holding ("…78?" — "yes"), never
 * enough to reconstruct or to read off a screen from behind.
 */
export function maskNationalId(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.length <= 2) return MASKED_PLACEHOLDER;
  return `${MASKED_PLACEHOLDER}${raw.slice(-2)}`;
}

/**
 * Mask a phone number, keeping the country/area shape and the last three
 * digits — the part a member reads back to confirm it is theirs.
 */
export function maskPhone(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length <= 3) return MASKED_PLACEHOLDER;
  const prefix = raw.startsWith("+") ? `+${digits.slice(0, 3)}` : "";
  return `${prefix} ${MASKED_PLACEHOLDER}${digits.slice(-3)}`.trim();
}

/** Mask an email, keeping the first character and the domain. */
export function maskEmail(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const at = raw.indexOf("@");
  if (at < 1) return MASKED_PLACEHOLDER;
  return `${raw[0]}${MASKED_PLACEHOLDER}${raw.slice(at)}`;
}

/**
 * A date of birth reduced to what an operator actually needs: the age.
 *
 * An exact DOB is an identity credential; "36y" answers "is this an adult, is
 * this dependant still within the age limit" without being one.
 */
export function ageOnly(dateOfBirth: Date | string | null | undefined): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const years = Math.floor((Date.now() - dob.getTime()) / (1000 * 3600 * 24 * 365.25));
  if (years < 0 || years > 130) return null;
  return `${years}y`;
}

/** Uganda's age of majority — below this a dependant is a minor. */
export const AGE_OF_MAJORITY = 18;

export function isMinor(dateOfBirth: Date | string | null | undefined): boolean {
  const age = ageOnly(dateOfBirth);
  if (!age) return false;
  return Number.parseInt(age, 10) < AGE_OF_MAJORITY;
}

export interface HouseholdSummary {
  /** How many dependants there are. */
  count: number;
  /** How many of them are minors — a count, never their names. */
  minorCount: number;
  /** Copy for the collapsed state. */
  label: string;
}

/**
 * Collapse a household to counts.
 *
 * DEF-080's specific harm was "a MINOR dependant's full name, member number and
 * age" on a screen with a queue behind it. A count answers the operational
 * question — does this member have dependants, how many — without naming a
 * child. Names live behind the Dependants tab, which the page already gates.
 */
export function summariseHousehold(
  dependants: readonly { dateOfBirth: Date | string | null }[],
): HouseholdSummary {
  const count = dependants.length;
  const minorCount = dependants.filter((d) => isMinor(d.dateOfBirth)).length;

  const label =
    count === 0
      ? "No dependants"
      : `${count} dependant${count === 1 ? "" : "s"}${
          minorCount > 0 ? ` (${minorCount} under ${AGE_OF_MAJORITY})` : ""
        }`;

  return { count, minorCount, label };
}

/** What a reveal request must carry. A reveal without a why is not auditable. */
export interface RevealRequest {
  memberId: string;
  field: RevealableField;
  purpose: string;
}

export type RevealableField = "idNumber" | "phone" | "email";

export const REVEALABLE_FIELDS: readonly RevealableField[] = ["idNumber", "phone", "email"];

export const REVEAL_FIELD_LABELS: Record<RevealableField, string> = {
  idNumber: "National ID",
  phone: "Phone number",
  email: "Email address",
};

/** Shortest purpose we will accept. Deliberately short — but not empty. */
export const MIN_REVEAL_PURPOSE = 5;

export function mayReveal(permissions: readonly string[] | undefined): boolean {
  return !!permissions?.includes(SENSITIVE_REVEAL_PERMISSION);
}
