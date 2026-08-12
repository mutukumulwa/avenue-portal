import type { Prisma } from "@prisma/client";
import {
  normalizeMemberNumber,
  normalizeNationalId,
  normalizePhone,
  ugandaPhoneVariants,
} from "@/lib/normalize";

/**
 * UAT-HF P05.07 — canonical multi-identifier member search.
 *
 * DEF-030 (S3): 'Enrolling with "0772555042" stores the number canonically as
 * "+256772555042". Searching ... for "0772555042" — the exact string that was
 * entered, and the form a member reads from their own handset — returns "0 of
 * 2772 results" ... Storage normalises the local form; search does not.'
 * DEF-064 (S3): "the dash-less form of the same number returns 0 results" while
 * the dashed member number resolves to exactly one member.
 *
 * Both are the same asymmetry: the write path normalised and the read path did
 * not. P05.01 put canonical keys on every member; this matches against them.
 *
 * ## How a token is matched
 *
 * Each token is tried BOTH as raw text (so partial name and substring matches
 * keep working exactly as before) AND as every identifier it could canonically
 * be. A token that parses as a Uganda phone number also probes
 * `phoneNormalized`; one that looks like a member number also probes
 * `memberNumberNormalized` with punctuation stripped; and so on. A token is a
 * hit if any of those match, so no previously-findable member becomes
 * unfindable.
 *
 * Multiple tokens are an AND of per-token ORs, so "Mark Kato" matches firstName
 * + lastName in either order without a full-text index.
 *
 * ## Scope
 *
 * This builds a `WHERE` fragment and nothing else. It never contains a tenant,
 * client or provider filter — the caller composes it with theirs, and every
 * caller must, because a search clause that quietly widened scope would be a
 * far worse defect than the one it fixes.
 */

/**
 * Hard cap on rows any search may return.
 *
 * Enumeration guard: a one-character query matches thousands of members, and an
 * uncapped result set turns the search box into a bulk export of the register.
 */
export const MEMBER_SEARCH_RESULT_CAP = 200;

/** Shortest token that may be matched as a substring. */
const MIN_SUBSTRING_TOKEN = 2;

export function memberSearchClause(q: string | null | undefined): Prisma.MemberWhereInput {
  const tokens = (q ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};

  if (tokens.length === 1) return { OR: tokenClauses(tokens[0]) };
  return { AND: tokens.map((t) => ({ OR: tokenClauses(t) })) };
}

function tokenClauses(token: string): Prisma.MemberWhereInput[] {
  const clauses: Prisma.MemberWhereInput[] = [];

  // ── Raw substring matching, as before ────────────────────────────────────
  // A single character would match most of the register, so the substring
  // probes need at least two. An exact-identifier probe below is still tried
  // for short tokens, because "42" as a whole member number is a real query.
  if (token.length >= MIN_SUBSTRING_TOKEN) {
    clauses.push(
      { firstName: { contains: token, mode: "insensitive" } },
      { lastName: { contains: token, mode: "insensitive" } },
      { otherNames: { contains: token, mode: "insensitive" } },
      { memberNumber: { contains: token, mode: "insensitive" } },
      { email: { contains: token, mode: "insensitive" } },
      { phone: { contains: token, mode: "insensitive" } },
      { idNumber: { contains: token, mode: "insensitive" } },
      { group: { name: { contains: token, mode: "insensitive" } } },
      // P05.01's collapsed name key, so "amina kato" matches however the parts
      // were spaced or cased when they were typed in.
      { searchNameNormalized: { contains: token.toLowerCase(), mode: "insensitive" } },
    );
  }

  // ── DEF-030: the phone, in whatever form it was typed ────────────────────
  const phoneKey = normalizePhone(token);
  if (phoneKey) {
    clauses.push({ phoneNormalized: phoneKey });
    // Legacy rows written before the backfill, and any row a non-canonical
    // writer created, still hold the raw string.
    clauses.push({ phone: { in: ugandaPhoneVariants(token) } });
  } else if (/^\d{6,}$/.test(token)) {
    // A bare run of digits — the fragment a caller reads out mid-number. Match
    // it inside the canonical key so "772555042" finds "+256772555042".
    clauses.push({ phoneNormalized: { contains: token } });
  }

  // ── DEF-064: the member number, with or without its dashes ───────────────
  const memberNumberKey = normalizeMemberNumber(token);
  if (memberNumberKey.length >= MIN_SUBSTRING_TOKEN) {
    clauses.push({ memberNumberNormalized: { contains: memberNumberKey } });
  }

  // ── National ID, spacing and case folded ─────────────────────────────────
  const idKey = normalizeNationalId(token);
  if (idKey.length >= MIN_SUBSTRING_TOKEN) {
    clauses.push({ nationalIdNormalized: { contains: idKey } });
  }

  // ── Email, case folded ───────────────────────────────────────────────────
  if (token.includes("@")) {
    clauses.push({ emailNormalized: token.toLowerCase() });
  }

  return clauses;
}

/**
 * Clamp a caller's requested page size to the enumeration cap.
 *
 * Exported so every search route uses one number rather than each picking its
 * own and one of them picking none.
 */
export function memberSearchTake(requested?: number): number {
  if (!requested || requested < 1) return MEMBER_SEARCH_RESULT_CAP;
  return Math.min(Math.trunc(requested), MEMBER_SEARCH_RESULT_CAP);
}
