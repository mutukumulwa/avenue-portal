import { prisma } from "@/lib/prisma";
import type { MemberStatus, MemberRelationship, Gender } from "@prisma/client";
import { FraudService } from "./fraud.service";
import { nextMemberNumber } from "./member-numbering.service";
import { coverageService } from "./coverage.service";
import { assertEnrolmentAge } from "./eligibility/enrolment-age";
import { GroupsService } from "./groups.service";
import { normalizeNationalId, normalizeEmail, normalizePhone } from "@/lib/normalize";
import {
  DuplicateIdentityError,
  blockingMatch,
  blockingMessage,
  candidateWarnings,
  findIdentityMatches,
} from "@/server/services/identity-match.service";
import { canEditTransition } from "@/lib/member-status";

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
    const group = await prisma.group.findUnique({
      where: { id: data.groupId, tenantId },
    });

    if (!group) throw new Error("Group not found");

    // NW-D02: when a dependant is linked to a principal, validate the principal
    // and enrol the dependant into the principal's own scheme (a dependant must
    // never land in a different group than the family they belong to).
    let effectiveGroup = group;
    if (data.principalId) {
      const principal = await prisma.member.findFirst({
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
    const ageRules = await prisma.package.findUnique({
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
    const identityMatches = await findIdentityMatches(prisma, tenantId, {
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
    const memberNumber = await nextMemberNumber(tenantId, effectiveGroup.clientId);

    // Auto-assign the scheme's default benefit tier (the mechanism existed; only
    // the call was missing — members otherwise landed with a null tier).
    const benefitTierId = await GroupsService.resolveDefaultTierId(effectiveGroup.id);

    const member = await prisma.member.create({
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
      },
    });

    // WP-3.5E: open a coverage period from the effective date so the point-in-time
    // engine (coverageService) sees this member. Manually / import-enrolled members
    // previously got NONE — the eligibility engine was blind to them. Idempotent.
    await coverageService.openPeriod(prisma, tenantId, member.id, effectiveDate, data.coveragePeriodReason ?? "ENROLMENT");

    // P05.04: candidate identity matches are warnings, never blocks (DEC-07).
    return { member, warnings: [...identityWarnings, ...enrollmentWarnings] };
  }

  /**
   * Updates editable fields on an existing member
   */
  static async updateMember(tenantId: string, memberId: string, data: {
    firstName: string;
    lastName: string;
    otherNames?: string;
    idNumber?: string;
    dateOfBirth: string | Date;
    gender: Gender;
    phone?: string;
    email?: string;
    relationship: MemberRelationship;
    status: MemberStatus;
  }) {
    const member = await prisma.member.findUnique({ where: { id: memberId, tenantId } });
    if (!member) throw new Error("Member not found");

    // ── WP-3.5G: lifecycle state machine ──────────────────────────────────────
    // The general edit dropdown may only perform governed transitions. It can
    // NEVER move a terminal member back to ACTIVE (reinstatement is a governed
    // flow) or re-terminate a terminal member — those must go through the
    // dedicated lifecycle flows with their own reason + audit.
    if (!canEditTransition(member.status, data.status)) {
      throw new Error(
        `Cannot change member status from ${member.status} to ${data.status} from the edit form. ` +
        `${member.status} is a governed lifecycle state — use the reinstatement / lifecycle flow instead.`,
      );
    }

    // UAT-HF P05.04 — DEF-078. Both probes here named the other member and their
    // member number, and the phone one blocked a legitimate shared household
    // line besides (DEC-07). Same service as enrolment, so the two channels
    // cannot drift: national ID blocks, phone does not.
    const editMatches = await findIdentityMatches(
      prisma,
      tenantId,
      { nationalId: data.idNumber, phone: data.phone },
      { excludeMemberId: memberId },
    );
    const editBlocking = blockingMatch(editMatches);
    if (editBlocking) throw new DuplicateIdentityError(blockingMessage(editBlocking));

    const updated = await prisma.member.update({
      where: { id: memberId, tenantId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        otherNames: data.otherNames || null,
        idNumber: data.idNumber || null,
        dateOfBirth: new Date(data.dateOfBirth),
        gender: data.gender,
        phone: data.phone || null,
        email: data.email || null,
        relationship: data.relationship,
        status: data.status,
      },
    });

    // WP-3.5E: keep coverage history correct across a manual suspend / reinstate so
    // point-in-time eligibility is right. Suspending closes the open period (no
    // cover during suspension); reinstating from SUSPENDED reopens a fresh one,
    // leaving the suspension window as an uncovered gap.
    if (member.status !== "SUSPENDED" && data.status === "SUSPENDED") {
      await coverageService.closeOpenPeriods(prisma, memberId, new Date(), "SUSPENDED");
    } else if (member.status === "SUSPENDED" && data.status === "ACTIVE") {
      await coverageService.openPeriod(prisma, tenantId, memberId, new Date(), "REINSTATEMENT");
    }

    // WP-3.5G: hand the caller the prior status so it can emit a DISTINCT audit
    // action per transition (MEMBER_SUSPENDED / MEMBER_REINSTATED / …) instead of
    // a generic MEMBER_UPDATED.
    return { member: updated, previousStatus: member.status };
  }
}
