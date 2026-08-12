import { prisma } from "@/lib/prisma";
import type { MemberStatus, MemberRelationship, Gender } from "@prisma/client";
import { FraudService } from "./fraud.service";
import { nextMemberNumber } from "./member-numbering.service";
import { coverageService } from "./coverage.service";
import { assertEnrolmentAge } from "./eligibility/enrolment-age";
import { GroupsService } from "./groups.service";
import {
  memberIdentityKeys,
  normalizeEmail,
  normalizeNationalId,
  normalizePhone,
  normalizeSearchName,
} from "@/lib/normalize";
import {
  DuplicateIdentityError,
  blockingMatch,
  blockingMessage,
  candidateWarnings,
  findIdentityMatches,
} from "@/server/services/identity-match.service";
import { canEditTransition } from "@/lib/member-status";
import type { Prisma } from "@prisma/client";
import {
  applyWithPrecondition,
  type ExpectedState,
  type PreconditionOutcome,
} from "@/lib/concurrency";

/** Relationships an enrolment path may assign (SIBLING added in WP-3.5F). */
export type EnrolmentRelationship = "PRINCIPAL" | "SPOUSE" | "CHILD" | "PARENT" | "SIBLING";

export class MembersService {
  /**
   * Retrieves all members for a given tenant
   */
  static async getMembers(tenantId: string, clientId?: string | null) {
    return prisma.member.findMany({
      // Client isolation (G2.1 / G5.2): confined users see only their client's members.
      where: { tenantId, ...(clientId ? { group: { clientId } } : {}) },
      include: {
        group: true,
        package: true,
        principal: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a specific member
   */
  static async getMemberById(tenantId: string, memberId: string) {
    return prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: {
        group: true,
        package: {
          include: {
            currentVersion: {
              include: { benefits: true },
            },
          },
        },
        dependents: true,
      },
    });
  }

  /**
   * Registers a new member into a group
   */
  static async createMember(tenantId: string, data: {
    groupId: string;
    firstName: string;
    lastName: string;
    idNumber?: string;
    dateOfBirth: string | Date;
    gender: "MALE" | "FEMALE" | "OTHER";
    phone?: string;
    email?: string;
    relationship?: EnrolmentRelationship;
    principalId?: string;
    /**
     * WP-3.5E: operator-supplied enrolment effective date. Drives enrollmentDate,
     * coverStartDate and the opening MemberCoveragePeriod so point-in-time
     * eligibility resolves by the real cover start, not "now". Defaults to today.
     */
    effectiveDate?: string | Date;
    /**
     * WP-3.5F newborn (CT-033): when the birth is notified within 30 days, the
     * newborn is covered from the DATE OF BIRTH (effectiveDate is pulled back to
     * the DOB) and may enrol without a national ID. Stored on the member.
     */
    birthNotificationDate?: string | Date;
    /**
     * WP-3.5E/F: the reason stamped on the opening MemberCoveragePeriod. The HR /
     * endorsement channel passes "ENDORSEMENT"; defaults to "ENROLMENT" (manual +
     * import).
     */
    coveragePeriodReason?: string;
  }) {
    /**
     * UAT-HF P05.03 — the whole enrolment is ONE transaction.
     *
     * It was a sequence of independent writes: allocate a number, create the
     * member row, open a coverage period. A failure after the member committed
     * left a member with NO coverage period — invisible to the point-in-time
     * eligibility engine — with nothing on the outside to say so. The
     * acceptance is explicit: "forced failure after member insert rolls
     * everything back".
     *
     * Every read and write below uses `tx`, including the member-number
     * allocation (P05.02) and the coverage period, so a rolled-back enrolment
     * leaves nothing behind — not a member, not a period, not a consumed
     * number... except the number, which is a sequence and does not go
     * backwards. That gap is documented in P05.02.
     */
    return prisma.$transaction(async (tx) => {

      const group = await tx.group.findUnique({
        where: { id: data.groupId, tenantId },
      });

      if (!group) throw new Error("Group not found");

      // NW-D02: when a dependant is linked to a principal, validate the principal
      // and enrol the dependant into the principal's own scheme (a dependant must
      // never land in a different group than the family they belong to).
      let effectiveGroup = group;
      if (data.principalId) {
        const principal = await tx.member.findFirst({
          where: { id: data.principalId, tenantId },
          select: { id: true, relationship: true, groupId: true, group: true },
        });
        if (!principal) throw new Error("Principal member not found for this dependant.");
        // M-013: a dependant cannot own dependants — the link target must itself be a
        // PRINCIPAL (a dependant linked to a dependant is rejected here).
        if (principal.relationship !== "PRINCIPAL") {
          throw new Error("Dependants can only be linked to a PRINCIPAL member.");
        }
        if (data.relationship === "PRINCIPAL") {
          throw new Error("A member linked to a principal cannot itself be a PRINCIPAL.");
        }
        // M-014: a dependant must join the principal's OWN scheme. Previously the
        // caller's groupId was silently overwritten with the principal's; now a
        // genuine cross-scheme link attempt is rejected explicitly server-side.
        if (data.groupId && data.groupId !== principal.groupId) {
          throw new Error(
            "A dependant must be enrolled in the same scheme as its principal — cross-scheme dependant links are not allowed.",
          );
        }
        // Inherit the principal's scheme.
        effectiveGroup = principal.group;
        data.groupId = principal.groupId;
      }

      // ── WP-3.5F newborn (CT-033): DOB-effective when notified within 30 days ────
      // A newborn notified within 30 days of birth is covered FROM the date of birth
      // (and may enrol without a national ID — idNumber is already optional). Later
      // notifications keep the supplied effective date (or today).
      const dobForEffective = new Date(data.dateOfBirth);
      let effectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : new Date();
      const birthNotificationDate = data.birthNotificationDate ? new Date(data.birthNotificationDate) : null;
      if (
        birthNotificationDate &&
        !Number.isNaN(birthNotificationDate.getTime()) &&
        !Number.isNaN(dobForEffective.getTime())
      ) {
        const daysSinceBirth = Math.floor((birthNotificationDate.getTime() - dobForEffective.getTime()) / 86_400_000);
        if (daysSinceBirth >= 0 && daysSinceBirth <= 30) {
          effectiveDate = dobForEffective; // covered from birth
        }
      }

      // ── WP-3.5D: age gate at enrolment ────────────────────────────────────────
      // Reject an over-age principal / dependant (and future/impossible DOB) against
      // the scheme package's caps, as of the effective date. Exactly-max is eligible.
      const ageRules = await tx.package.findUnique({
        where: { id: effectiveGroup.packageId, tenantId },
        select: { maxAge: true, dependentMaxAge: true },
      });
      assertEnrolmentAge(
        {
          relationship: data.relationship ?? "PRINCIPAL",
          dateOfBirth: data.dateOfBirth,
          firstName: data.firstName,
          lastName: data.lastName,
        },
        effectiveDate,
        ageRules,
      );

      // ── Duplicate detection (M-005/006/007) ────────────────────────────────────
      // Normalize BEFORE probing so identity variants collide: national ID by
      // case/interior-space, phone across +256 / 256 / 0 formats, email by case.
      // New members are then STORED in the normalized form so the probes stay
      // consistent (idKey/phoneKey/emailKey below).
      const idKey = data.idNumber?.trim() ? normalizeNationalId(data.idNumber) : "";
      const phoneKey = data.phone?.trim() ? normalizePhone(data.phone) : null;
      const emailKey = data.email?.trim() ? normalizeEmail(data.email) : "";

      // ── UAT-HF P05.04 — DEF-078 / DEC-07 ─────────────────────────────────────
      // These four probes used to throw messages naming the other member and
      // their member number, e.g. 'A member with phone "…" already exists:
      // Margaret Bukenya (NWSC-2026-00362)' — including members in a different
      // client group. That turned the enrolment form into an identifier lookup:
      // supply a phone, learn who holds it, one guess at a time.
      //
      // Two things change. The messages no longer name anybody, and only the
      // NATIONAL ID still blocks: DEC-07 is explicit that "a principal and their
      // dependants routinely share one number", so refusing a duplicate phone was
      // both a disclosure and simply wrong. Phone, email and name+DOB now flow
      // into the same `warnings` channel the form already renders.
      const identityMatches = await findIdentityMatches(tx, tenantId, {
        nationalId: data.idNumber,
        phone: data.phone,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
      });

      const blocking = blockingMatch(identityMatches);
      if (blocking) {
        // Still a hard stop — the run noted this guard "is also the only thing
        // that prevented a duplicate member after the silently committed write in
        // O-005". The protection stays; only the disclosure goes.
        throw new DuplicateIdentityError(blockingMessage(blocking));
      }

      const identityWarnings = candidateWarnings(identityMatches);

      // ── Enrollment fraud risk check (soft warnings, never blocks) ────────────
      const enrollmentWarnings = await FraudService.checkEnrollmentRisk({
        groupId: data.groupId,
        tenantId,
        dateOfBirth: new Date(data.dateOfBirth),
        relationship: data.relationship,
      });
      // ─────────────────────────────────────────────────────────────────────────

      // Generate member number (client-configurable prefix, G9.6). NW-D01: derive
      // the prefix from the owning Client so members inherit e.g. NWSC-… not MVX-…
      const memberNumber = await nextMemberNumber(tenantId, effectiveGroup.clientId, tx);

      // Auto-assign the scheme's default benefit tier (the mechanism existed; only
      // the call was missing — members otherwise landed with a null tier).
      const benefitTierId = await GroupsService.resolveDefaultTierId(effectiveGroup.id);

      const member = await tx.member.create({
        data: {
          tenantId,
          memberNumber,
          groupId: effectiveGroup.id,
          firstName: data.firstName,
          lastName: data.lastName,
          // Store the NORMALIZED identity keys so dedup stays consistent going forward.
          idNumber: idKey || null,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender,
          phone: phoneKey ?? data.phone?.trim() ?? null,
          email: emailKey || null,
          relationship: (data.relationship || "PRINCIPAL") as MemberRelationship,
          principalId: data.principalId,
          benefitTierId,
          packageId: effectiveGroup.packageId,
          packageVersionId: effectiveGroup.packageVersionId,
          enrollmentDate: effectiveDate,
          coverStartDate: effectiveDate,
          birthNotificationDate,
          status: "ACTIVE", // For milestone simplicity
          // UAT-HF P05.01: the canonical keys, written at enrolment. Without them
          // a new member is unkeyed and invisible to the canonical search — the
          // asymmetry that caused DEF-030 in the first place.
          ...memberIdentityKeys({
            idNumber: idKey || null,
            phone: phoneKey ?? data.phone,
            email: emailKey || null,
            memberNumber,
            firstName: data.firstName,
            lastName: data.lastName,
          }),
        },
      });

      // WP-3.5E: open a coverage period from the effective date so the point-in-time
      // engine (coverageService) sees this member. Manually / import-enrolled members
      // previously got NONE — the eligibility engine was blind to them. Idempotent.
      await coverageService.openPeriod(tx, tenantId, member.id, effectiveDate, data.coveragePeriodReason ?? "ENROLMENT");

      // P05.04: candidate identity matches are warnings, never blocks (DEC-07).
      return { member, warnings: [...identityWarnings, ...enrollmentWarnings] };
    });
  }

  /**
   * Updates editable fields on an existing member
   */
  /**
   * UAT-HF P05.05 — a profile edit: demographics only, conditional on the copy
   * the operator loaded.
   *
   * Replaces `updateMember`, which took `status` alongside the demographics and
   * wrote every field unconditionally. That is DEF-077 (silent lost update) and
   * DEF-041/DEF-043 (a lifecycle change with the ceremony of a spelling fix) in
   * one method.
   *
   * Returns STALE — having written nothing — when the record moved underneath
   * the operator. The precondition is in the WHERE clause, so the check and the
   * write are one statement and there is no window between them.
   */
  static async updateProfile(
    tenantId: string,
    memberId: string,
    edits: Partial<{
      firstName: string;
      lastName: string;
      otherNames: string;
      idNumber: string;
      dateOfBirth: string;
      gender: string;
      phone: string;
      email: string;
      relationship: string;
    }>,
    expected: ExpectedState,
  ): Promise<PreconditionOutcome> {
    if (Object.keys(edits).length === 0) return "APPLIED";

    // P05.04: identity rules are the same in every channel. National ID blocks;
    // a shared phone does not (DEC-07).
    if (edits.idNumber !== undefined || edits.phone !== undefined) {
      const matches = await findIdentityMatches(
        prisma,
        tenantId,
        { nationalId: edits.idNumber, phone: edits.phone },
        { excludeMemberId: memberId },
      );
      const blocking = blockingMatch(matches);
      if (blocking) throw new DuplicateIdentityError(blockingMessage(blocking));
    }

    const data: Prisma.MemberUpdateInput = {};
    if (edits.firstName !== undefined) data.firstName = edits.firstName;
    if (edits.lastName !== undefined) data.lastName = edits.lastName;
    if (edits.otherNames !== undefined) data.otherNames = edits.otherNames || null;
    if (edits.idNumber !== undefined) {
      data.idNumber = edits.idNumber ? normalizeNationalId(edits.idNumber) : null;
    }
    if (edits.dateOfBirth !== undefined) data.dateOfBirth = new Date(edits.dateOfBirth);
    if (edits.gender !== undefined) data.gender = edits.gender as Gender;
    if (edits.phone !== undefined) {
      data.phone = edits.phone ? (normalizePhone(edits.phone) ?? edits.phone) : null;
    }
    if (edits.email !== undefined) data.email = edits.email ? normalizeEmail(edits.email) : null;
    if (edits.relationship !== undefined) {
      data.relationship = edits.relationship as MemberRelationship;
    }

    // P05.01: keep the canonical keys in step with the fields they derive from,
    // or an edit silently un-keys the member for search.
    if (edits.idNumber !== undefined) {
      data.nationalIdNormalized = edits.idNumber ? normalizeNationalId(edits.idNumber) : null;
    }
    if (edits.phone !== undefined) {
      data.phoneNormalized = edits.phone ? normalizePhone(edits.phone) : null;
    }
    if (edits.email !== undefined) {
      data.emailNormalized = edits.email ? normalizeEmail(edits.email) : null;
    }
    if (edits.firstName !== undefined || edits.lastName !== undefined || edits.otherNames !== undefined) {
      const names = await prisma.member.findFirst({
        where: { id: memberId, tenantId },
        select: { firstName: true, lastName: true, otherNames: true },
      });
      data.searchNameNormalized = normalizeSearchName({
        firstName: edits.firstName ?? names?.firstName,
        lastName: edits.lastName ?? names?.lastName,
        otherNames: edits.otherNames ?? names?.otherNames,
      });
    }

    // P04.05: bump the row version alongside the write, so a future precondition
    // can use it instead of the millisecond-granular updatedAt.
    data.version = { increment: 1 };

    return applyWithPrecondition(
      async ({ expected: exp }) =>
        prisma.member.updateMany({
          // The precondition IS the WHERE clause. Reading the row and then
          // updating it leaves exactly the race this closes.
          where: { id: memberId, tenantId, updatedAt: new Date(exp.updatedAt) },
          data,
        }),
      expected,
    );
  }

  /**
   * UAT-HF P05.05 — a lifecycle status change, as its own command.
   *
   * Deliberately separate from {@link updateProfile}: the caller supplies a
   * reason and gets a distinct audit action. Coverage effects are preserved
   * from the old `updateMember` — suspending closes the open period, and
   * reinstating from SUSPENDED opens a fresh one, so point-in-time eligibility
   * stays correct across the gap.
   *
   * P07.01 replaces this with the full transition policy table.
   */
  static async changeStatus(tenantId: string, memberId: string, next: MemberStatus) {
    const member = await prisma.member.findFirst({
      where: { id: memberId, tenantId },
      select: { id: true, status: true },
    });
    if (!member) throw new Error("Member not found");

    if (!canEditTransition(member.status, next)) {
      throw new Error(
        `Cannot change member status from ${member.status} to ${next} from the edit path. ` +
          `${member.status} is a governed lifecycle state — use the reinstatement / lifecycle flow instead.`,
      );
    }

    const updated = await prisma.member.update({
      where: { id: memberId, tenantId },
      data: { status: next },
    });

    if (member.status !== "SUSPENDED" && next === "SUSPENDED") {
      await coverageService.closeOpenPeriods(prisma, memberId, new Date(), "SUSPENDED");
    } else if (member.status === "SUSPENDED" && next === "ACTIVE") {
      await coverageService.openPeriod(prisma, tenantId, memberId, new Date(), "REINSTATEMENT");
    }

    return { member: updated, previousStatus: member.status };
  }
}
