/**
 * UAT-HF P05.04 — resolving a duplicate-identity match to a person.
 *
 * `findIdentityMatches` deliberately returns an **opaque** member id: the run's
 * operator learned the outcome of a lost write from a disclosed member number
 * belonging to a *different client group*, which is a cross-client PII leak
 * dressed as a helpful error. So the enrolment form is told "this ID is already
 * on file" and nothing more.
 *
 * That was the right call and it left a hole the log recorded: "no route
 * resolves a match to a person, so an operator who hits a hard conflict cannot
 * get the answer from anyone in-product." They ring a colleague, or they give
 * up and create a second record — which is the duplicate the block existed to
 * prevent.
 *
 * This is that route. Three properties make it safe to have at all:
 *
 * **It is permission-gated, not role-gated.** `member.duplicate.review` is
 * granted to a person, not inherited by everyone who happens to be MEMBER_OPS.
 *
 * **It is minimum-necessary.** The reviewer gets the matched member's name,
 * number, scheme and status — enough to say "yes, that is the same person" or
 * "no, different person, same phone" (DEC-07: shared household phones are
 * legitimate). It does **not** return date of birth, national ID, address or
 * contact details, because none of those is needed to make that judgement.
 *
 * **Every resolution is audited before it is returned.** A lookup that names a
 * person on the strength of an identifier someone typed is exactly the event a
 * privacy review needs to see, and writing the audit *after* the read would
 * lose it on a crash. The audit is the price of the answer.
 */

import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  DUPLICATE_REVIEW_PERMISSION,
  mayReviewDuplicates,
  type MatchSignal,
} from "@/server/services/identity-match.service";

export { DUPLICATE_REVIEW_PERMISSION };

export interface DuplicateReviewResult {
  memberId: string;
  memberNumber: string;
  fullName: string;
  status: string;
  schemeName: string | null;
  /** Which signal matched, so the reviewer knows what they are comparing. */
  signal: MatchSignal;
  /** True when the match is on a signal that is legitimately shared (DEC-07). */
  sharedSignalCaveat: string | null;
}

export type DuplicateReviewOutcome =
  | { ok: true; match: DuplicateReviewResult }
  | { ok: false; reason: "NOT_PERMITTED" | "NOT_FOUND"; message: string };

/**
 * A signal that two records can legitimately share.
 *
 * DEC-07 settled this for phones: a household shares one number, and treating
 * that as a duplicate would block a spouse from enrolling. Saying so at the
 * point of review is what stops a reviewer merging two real people.
 */
const SHARED_SIGNAL_CAVEAT: Partial<Record<MatchSignal, string>> = {
  PHONE:
    "A shared phone number is normal — households and small employers routinely use one. Confirm the name and date of birth before treating these as the same person.",
  EMAIL:
    "A shared email address is common on employer-provided accounts. Confirm the name before treating these as the same person.",
  NAME_DOB:
    "Name and date of birth can coincide. Check an identity document before treating these as the same person.",
};

/**
 * Resolve a match to a person, for a reviewer who is allowed to know.
 *
 * `tenantId` scopes the read as everywhere else. The match may be in another
 * *client group* within the tenant — that is the whole reason the enrolment
 * form cannot answer — so client scoping is deliberately NOT applied here, and
 * the audit row is what makes that acceptable.
 */
export async function resolveDuplicateMatch(input: {
  tenantId: string;
  matchedMemberId: string;
  signal: MatchSignal;
  reviewer: { id: string; permissions: readonly string[] | undefined };
  /** Why they are looking. Recorded; there is no anonymous reveal. */
  purpose: string;
}): Promise<DuplicateReviewOutcome> {
  if (!mayReviewDuplicates(input.reviewer.permissions)) {
    return {
      ok: false,
      reason: "NOT_PERMITTED",
      message:
        "You do not have duplicate-review permission. Ask an administrator for it rather than creating a second record.",
    };
  }

  const member = await prisma.member.findFirst({
    where: { id: input.matchedMemberId, tenantId: input.tenantId },
    select: {
      id: true,
      memberNumber: true,
      firstName: true,
      lastName: true,
      status: true,
      group: { select: { name: true } },
    },
  });

  if (!member) {
    return {
      ok: false,
      reason: "NOT_FOUND",
      message: "That record no longer exists. Re-run the check before enrolling.",
    };
  }

  // Audited BEFORE the answer is returned. A reveal that fails to record itself
  // must not still hand over the name.
  await writeAudit({
    userId: input.reviewer.id,
    action: "MEMBER_DUPLICATE_RESOLVED",
    module: "MEMBERS",
    description: `Duplicate-identity match resolved on ${input.signal}`,
    metadata: {
      matchedMemberId: member.id,
      signal: input.signal,
      purpose: input.purpose,
    },
  });

  return {
    ok: true,
    match: {
      memberId: member.id,
      memberNumber: member.memberNumber,
      fullName: `${member.firstName} ${member.lastName}`,
      status: member.status,
      schemeName: member.group?.name ?? null,
      signal: input.signal,
      sharedSignalCaveat: SHARED_SIGNAL_CAVEAT[input.signal] ?? null,
    },
  };
}
