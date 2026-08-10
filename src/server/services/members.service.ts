import { prisma } from "@/lib/prisma";
import type { MemberStatus, MemberRelationship, Gender } from "@prisma/client";
import { FraudService } from "./fraud.service";
import { nextMemberNumber } from "./member-numbering.service";
import { coverageService } from "./coverage.service";
import { assertEnrolmentAge } from "./eligibility/enrolment-age";

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
    relationship?: "PRINCIPAL" | "SPOUSE" | "CHILD" | "PARENT";
    principalId?: string;
    /**
     * WP-3.5E: operator-supplied enrolment effective date. Drives enrollmentDate,
     * coverStartDate and the opening MemberCoveragePeriod so point-in-time
     * eligibility resolves by the real cover start, not "now". Defaults to today.
     */
    effectiveDate?: string | Date;
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
      if (principal.relationship !== "PRINCIPAL") {
        throw new Error("Dependants can only be linked to a PRINCIPAL member.");
      }
      if (data.relationship === "PRINCIPAL") {
        throw new Error("A member linked to a principal cannot itself be a PRINCIPAL.");
      }
      // Inherit the principal's scheme.
      effectiveGroup = principal.group;
      data.groupId = principal.groupId;
    }

    // ── WP-3.5D: age gate at enrolment ────────────────────────────────────────
    // Reject an over-age principal / dependant (and future/impossible DOB) against
    // the scheme package's caps, as of the effective date. Exactly-max is eligible.
    const effectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : new Date();
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

    // ── Duplicate detection ───────────────────────────────────────────────────
    // 1. National ID uniqueness (skip if blank)
    if (data.idNumber?.trim()) {
      const idDup = await prisma.member.findFirst({
        where: { tenantId, idNumber: data.idNumber.trim() },
        select: { memberNumber: true, firstName: true, lastName: true },
      });
      if (idDup) {
        throw new Error(
          `A member with National ID "${data.idNumber}" already exists: ${idDup.firstName} ${idDup.lastName} (${idDup.memberNumber})`
        );
      }
    }

    // 2. Phone uniqueness (skip if blank)
    if (data.phone?.trim()) {
      const phoneDup = await prisma.member.findFirst({
        where: { tenantId, phone: data.phone.trim() },
        select: { memberNumber: true, firstName: true, lastName: true },
      });
      if (phoneDup) {
        throw new Error(
          `A member with phone "${data.phone}" already exists: ${phoneDup.firstName} ${phoneDup.lastName} (${phoneDup.memberNumber})`
        );
      }
    }

    // 3. Name + DOB uniqueness within the same group
    const dob = new Date(data.dateOfBirth);
    const nameDobDup = await prisma.member.findFirst({
      where: {
        tenantId,
        groupId: data.groupId,
        firstName: { equals: data.firstName.trim(), mode: "insensitive" },
        lastName:  { equals: data.lastName.trim(),  mode: "insensitive" },
        dateOfBirth: dob,
      },
      select: { memberNumber: true, firstName: true, lastName: true },
    });
    if (nameDobDup) {
      throw new Error(
        `A member named "${data.firstName} ${data.lastName}" with the same date of birth already exists in this group (${nameDobDup.memberNumber})`
      );
    }

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

    const member = await prisma.member.create({
      data: {
        tenantId,
        memberNumber,
        groupId: effectiveGroup.id,
        firstName: data.firstName,
        lastName: data.lastName,
        idNumber: data.idNumber,
        dateOfBirth: new Date(data.dateOfBirth),
        gender: data.gender,
        phone: data.phone,
        email: data.email,
        relationship: data.relationship || "PRINCIPAL",
        principalId: data.principalId,
        packageId: effectiveGroup.packageId,
        packageVersionId: effectiveGroup.packageVersionId,
        enrollmentDate: effectiveDate,
        coverStartDate: effectiveDate,
        status: "ACTIVE", // For milestone simplicity
      },
    });

    // WP-3.5E: open a coverage period from the effective date so the point-in-time
    // engine (coverageService) sees this member. Manually / import-enrolled members
    // previously got NONE — the eligibility engine was blind to them. Idempotent.
    await coverageService.openPeriod(prisma, tenantId, member.id, effectiveDate, "ENROLMENT");

    return { member, warnings: enrollmentWarnings };
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

    // National ID uniqueness (skip if unchanged or blank)
    const newId = data.idNumber?.trim();
    if (newId && newId !== member.idNumber) {
      const dup = await prisma.member.findFirst({
        where: { tenantId, idNumber: newId, NOT: { id: memberId } },
        select: { memberNumber: true, firstName: true, lastName: true },
      });
      if (dup) throw new Error(`National ID "${newId}" is already assigned to ${dup.firstName} ${dup.lastName} (${dup.memberNumber})`);
    }

    // Phone uniqueness (skip if unchanged or blank)
    const newPhone = data.phone?.trim();
    if (newPhone && newPhone !== member.phone) {
      const dup = await prisma.member.findFirst({
        where: { tenantId, phone: newPhone, NOT: { id: memberId } },
        select: { memberNumber: true, firstName: true, lastName: true },
      });
      if (dup) throw new Error(`Phone "${newPhone}" is already assigned to ${dup.firstName} ${dup.lastName} (${dup.memberNumber})`);
    }

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

    return updated;
  }
}
