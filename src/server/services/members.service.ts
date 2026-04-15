import { prisma } from "@/lib/prisma";
import type { MemberStatus, MemberRelationship, Gender } from "@prisma/client";
import { FraudService } from "./fraud.service";

export class MembersService {
  /**
   * Retrieves all members for a given tenant
   */
  static async getMembers(tenantId: string) {
    return prisma.member.findMany({
      where: { tenantId },
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
  }) {
    const group = await prisma.group.findUnique({
      where: { id: data.groupId, tenantId },
    });

    if (!group) throw new Error("Group not found");

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

    // Generate member number
    const count = await prisma.member.count({ where: { tenantId } });
    const memberNumber = `AVH-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    const member = await prisma.member.create({
      data: {
        tenantId,
        memberNumber,
        groupId: group.id,
        firstName: data.firstName,
        lastName: data.lastName,
        idNumber: data.idNumber,
        dateOfBirth: new Date(data.dateOfBirth),
        gender: data.gender,
        phone: data.phone,
        email: data.email,
        relationship: data.relationship || "PRINCIPAL",
        principalId: data.principalId,
        packageId: group.packageId,
        packageVersionId: group.packageVersionId,
        enrollmentDate: new Date(),
        status: "ACTIVE", // For milestone simplicity
      },
    });

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

    return prisma.member.update({
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
  }
}
