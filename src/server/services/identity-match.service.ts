/**
 * UAT-HF P05.04 — one place that decides whether a person already exists, and
 * says so without naming them.
 *
 * DEF-078 (S2): 'Entering a phone number already held by another member returns
 * "Phone "+256700000111" is already assigned to Margaret Bukenya
 * (NWSC-2026-00362)", disclosing that member's full name and member number —
 * including members belonging to other client groups. Anyone with enrolment
 * access can therefore supply an identifier and learn who holds it, one guess at
 * a time.'
 *
 * The register is careful, and so is this fix. It records a property worth
 * keeping: that same message "is also the only thing that prevented a duplicate
 * member after the silently committed write in O-005, and the member number it
 * disclosed was the sole means by which that write's outcome became discoverable
 * at all." So the protection stays and the disclosure goes — the operator is
 * pointed at the operation receipt (P01.02) for outcome discovery, which answers
 * "did my enrolment save?" without answering "who holds this ID?".
 *
 * ## The policy, from DEC-07
 *
 * Signed and explicit: **hard identity conflict is exact national ID only.**
 * Phone is not globally unique — "a principal and their dependants routinely
 * share one number" — so a duplicate phone is at most a candidate warning. The
 * pre-existing code threw on a duplicate phone, which is both a disclosure and
 * wrong.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeEmail, normalizeNationalId, ugandaPhoneVariants } from "@/lib/normalize";

/**
 * A hard identity conflict. A distinct class so callers can map it to a
 * CONFLICT (P01.01) rather than an opaque 500 — and so no call site has to
 * pattern-match on message text.
 */
export class DuplicateIdentityError extends Error {
  readonly signal: MatchSignal;
  constructor(message: string, signal: MatchSignal = "NATIONAL_ID") {
    super(message);
    this.name = "DuplicateIdentityError";
    this.signal = signal;
  }
}

export type MatchSignal = "NATIONAL_ID" | "PHONE" | "EMAIL" | "NAME_DOB";

/**
 * HARD  — the write must not proceed. Exact national ID only (DEC-07).
 * CANDIDATE — worth a human look, never a block. Shared phones and twins are
 *             legitimate, and blocking them invents a defect to fix a defect.
 */
export type MatchStrength = "HARD" | "CANDIDATE";

export interface IdentityMatch {
  signal: MatchSignal;
  strength: MatchStrength;
  /**
   * Opaque id of the matched member. **Never** put this in an unprivileged
   * response — it is here so an authorized, audited review can resolve it.
   */
  matchedMemberId: string;
}

export interface IdentityProbe {
  nationalId?: string | null;
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: Date | string | null;
}

/** Messages an unprivileged caller may see. None of them names a person. */
export const MATCH_MESSAGE: Record<MatchSignal, string> = {
  NATIONAL_ID:
    "This national ID is already recorded against another member in this tenant. A national ID can only belong to one member, so this enrolment was not saved.",
  PHONE:
    "This phone number is already recorded against another member. That is allowed — households often share a number — so this is only a check, not a block.",
  EMAIL:
    "This email address is already recorded against another member. That is allowed, so this is only a check, not a block.",
  NAME_DOB:
    "Another member has the same name and date of birth. That is allowed — this may be a different person — so this is only a check, not a block.",
};

/**
 * What to tell an operator who does not have review permission.
 *
 * Deliberately says what to DO. The run's operator learned the outcome of a lost
 * write from the disclosed member number; this replaces that with a route that
 * does not require disclosing anybody.
 */
export const HARD_CONFLICT_NEXT_STEP =
  "If you were part-way through enrolling this person and are not sure whether it saved, use the operation reference below to check the outcome before trying again. To find out which member holds this ID, ask a colleague with duplicate-review permission — this form will not tell you.";

/** The permission an authorized reviewer needs to resolve a match to a person. */
export const DUPLICATE_REVIEW_PERMISSION = "member.duplicate.review";

type MemberDelegate = Pick<PrismaClient["member"], "findFirst" | "findMany">;

/**
 * Find identity matches for a would-be member.
 *
 * Scoped to `tenantId` always. The run found the disclosed member "belonged to a
 * different client group", so a match is looked for tenant-wide (a national ID
 * must be unique across the tenant) but the RESULT is only ever an opaque id.
 */
export async function findIdentityMatches(
  db: { member: MemberDelegate },
  tenantId: string,
  probe: IdentityProbe,
  options: { excludeMemberId?: string } = {},
): Promise<IdentityMatch[]> {
  const matches: IdentityMatch[] = [];
  const notSelf: Prisma.MemberWhereInput = options.excludeMemberId
    ? { NOT: { id: options.excludeMemberId } }
    : {};

  const nationalId = probe.nationalId?.trim() ? normalizeNationalId(probe.nationalId) : "";
  if (nationalId) {
    // Compare on the normalized key so "ck 12 34", "CK1234" and " ck1234 " are
    // one identity rather than three members.
    const hit = await db.member.findFirst({
      where: { tenantId, idNumber: { equals: nationalId, mode: "insensitive" }, ...notSelf },
      select: { id: true },
    });
    if (hit) matches.push({ signal: "NATIONAL_ID", strength: "HARD", matchedMemberId: hit.id });
  }

  const phoneVariants = probe.phone?.trim() ? ugandaPhoneVariants(probe.phone) : [];
  if (phoneVariants.length > 0) {
    // Every stored shape of the same line, because historical rows were not
    // normalized. A miss here is a missed warning, not a wrong block.
    const hit = await db.member.findFirst({
      where: { tenantId, phone: { in: phoneVariants }, ...notSelf },
      select: { id: true },
    });
    if (hit) matches.push({ signal: "PHONE", strength: "CANDIDATE", matchedMemberId: hit.id });
  }

  const email = probe.email?.trim() ? normalizeEmail(probe.email) : "";
  if (email) {
    const hit = await db.member.findFirst({
      where: { tenantId, email: { equals: email, mode: "insensitive" }, ...notSelf },
      select: { id: true },
    });
    if (hit) matches.push({ signal: "EMAIL", strength: "CANDIDATE", matchedMemberId: hit.id });
  }

  const dob = probe.dateOfBirth ? new Date(probe.dateOfBirth) : null;
  if (probe.firstName?.trim() && probe.lastName?.trim() && dob && !Number.isNaN(dob.getTime())) {
    const hit = await db.member.findFirst({
      where: {
        tenantId,
        firstName: { equals: probe.firstName.trim(), mode: "insensitive" },
        lastName: { equals: probe.lastName.trim(), mode: "insensitive" },
        dateOfBirth: dob,
        ...notSelf,
      },
      select: { id: true },
    });
    // Twins exist. This is a prompt to look, never a reason to refuse.
    if (hit) matches.push({ signal: "NAME_DOB", strength: "CANDIDATE", matchedMemberId: hit.id });
  }

  return matches;
}

/** The one match, if any, that must stop the write. */
export function blockingMatch(matches: IdentityMatch[]): IdentityMatch | null {
  return matches.find((m) => m.strength === "HARD") ?? null;
}

/** Candidate warnings, for display beside a successful save. */
export function candidateWarnings(matches: IdentityMatch[]): string[] {
  return matches.filter((m) => m.strength === "CANDIDATE").map((m) => MATCH_MESSAGE[m.signal]);
}

/**
 * The user-safe sentence for a blocking match.
 *
 * Takes the match, not the matched member, so there is no code path in which a
 * name could be interpolated by accident.
 */
export function blockingMessage(match: IdentityMatch): string {
  return `${MATCH_MESSAGE[match.signal]} ${HARD_CONFLICT_NEXT_STEP}`;
}

/**
 * Guard for anything that resolves a match to an actual person.
 *
 * The acceptance requires authorized review to be "tenant/client scoped and
 * audited". This function does not fetch — it decides whether fetching is
 * allowed, so the decision cannot be skipped by a caller that forgets.
 */
export function mayReviewDuplicates(permissions: readonly string[] | undefined): boolean {
  return !!permissions?.includes(DUPLICATE_REVIEW_PERMISSION);
}
