import { prisma } from "@/lib/prisma";
import { GLService } from "@/server/services/gl.service";
import type { Gender, MemberRelationship } from "@prisma/client";


export class EndorsementsService {
  /**
   * Calculates the pro-rata financial impact of a change.
   */
  static async calculateProRata(
    tenantId: string,
    groupId: string,
    effectiveDate: Date,
    type: "MEMBER_ADDITION" | "MEMBER_DELETION",
  ) {
    const group = await prisma.group.findUnique({
      where: { id: groupId, tenantId },
    });

    if (!group) throw new Error("Group not found");

    const renewalDate = new Date(group.renewalDate);
    
    // Calculate days remaining to renewal
    const timeDiff = renewalDate.getTime() - effectiveDate.getTime();
    const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
    
    const dailyRate = Number(group.contributionRate) / 365;
    
    const adjustment = dailyRate * daysRemaining;

    // Additional charge for addition, credit (negative) for deletion
    return type === "MEMBER_ADDITION" ? adjustment : -adjustment;
  }

  /**
   * Retrieves all endorsements
   */
  static async getEndorsements(tenantId: string) {
    return prisma.endorsement.findMany({
      where: { tenantId },
      include: {
        group: true,
        member: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves specific endorsement with related data
   */
  static async getEndorsementById(tenantId: string, id: string) {
    return prisma.endorsement.findUnique({
      where: { id, tenantId },
      include: {
        group: true,
        member: true,
      },
    });
  }

  /**
   * Creates a draft endorsement request
   */
  static async createEndorsement(tenantId: string, data: {
    groupId: string;
    type: "MEMBER_ADDITION" | "MEMBER_DELETION";
    effectiveDate: Date;
    changeDetails: Record<string, string>; // JSON containing member profile diff
    requestedBy?: string;
  }) {
    const count = await prisma.endorsement.count({ where: { tenantId } });
    const endorsementNumber = `END-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    
    const proRataAdjustment = await this.calculateProRata(tenantId, data.groupId, data.effectiveDate, data.type);

    return prisma.endorsement.create({
      data: {
        tenantId,
        endorsementNumber,
        groupId: data.groupId,
        type: data.type,
        status: "SUBMITTED",
        effectiveDate: data.effectiveDate,
        changeDetails: data.changeDetails as unknown as Record<string, string>,
        proratedAmount: proRataAdjustment,
        requestedBy: data.requestedBy || "SYSTEM",
      },
    });
  }

  /**
   * Approves and executes an endorsement
   */
  static async approveEndorsement(tenantId: string, endorsementId: string, approvedBy: string) {
    const endorsement = await prisma.endorsement.findUnique({
      where: { id: endorsementId, tenantId },
    });

    if (!endorsement) throw new Error("Endorsement not found");
    if (endorsement.status !== "SUBMITTED" && endorsement.status !== "UNDER_REVIEW") {
      throw new Error("Only pending endorsements can be approved");
    }

    // Execute the changes
    if (endorsement.type === "MEMBER_ADDITION") {
      const details = endorsement.changeDetails as Record<string, string>;
      const count = await prisma.member.count({ where: { tenantId } });
      const memberNumber = `AVH-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      const group = await prisma.group.findUnique({ where: { id: endorsement.groupId }});
      
      const newMember = await prisma.member.create({
        data: {
          tenantId,
          memberNumber,
          groupId: endorsement.groupId,
          firstName: details.firstName,
          lastName: details.lastName,
          dateOfBirth: new Date(details.dateOfBirth),
          gender: details.gender as Gender,
          relationship: (details.relationship || "PRINCIPAL") as MemberRelationship,
          status: "ACTIVE", // Activate upon approval
          enrollmentDate: new Date(endorsement.effectiveDate),
          packageId: group!.packageId,
          packageVersionId: group!.packageVersionId,
        }
      });
      
      // Document the member relation on the endorsement
      await prisma.endorsement.update({
        where: { id: endorsement.id },
        data: { memberId: newMember.id },
      });
    } else if (endorsement.type === "MEMBER_DELETION" && endorsement.changeDetails) {
       const details = endorsement.changeDetails as Record<string, string>;
       if (details.memberId) {
          await prisma.member.update({
            where: { id: details.memberId },
            data: { status: "TERMINATED", updatedAt: new Date() },
          });
       }
    }

    // Post GL adjustment if a pro-rata amount was calculated
    if (endorsement.proratedAmount && Number(endorsement.proratedAmount) !== 0) {
      try {
        await GLService.postEndorsementAdjustment(tenantId, {
          sourceId:  endorsement.id,
          reference: endorsement.endorsementNumber,
          amount:    Number(endorsement.proratedAmount),
          postedById: approvedBy,
        });

        // Generate an auto-adjustment invoice for the group
        const invCount = await prisma.invoice.count({ where: { tenantId } });
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invCount + 1).padStart(5, '0')}`;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);

        await prisma.invoice.create({
          data: {
             tenantId,
             invoiceNumber,
             groupId: endorsement.groupId,
             period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
             memberCount: endorsement.type === "MEMBER_ADDITION" ? 1 : 0,
             ratePerMember: Math.abs(Number(endorsement.proratedAmount)),
             totalAmount: endorsement.proratedAmount,
             balance: endorsement.proratedAmount,
             dueDate,
             status: "SENT", // Endorsement invoices implicitly sent
             notes: `Endorsement Adjustment for ${endorsement.endorsementNumber}`,
          }
        });

      } catch (err) {
        // GL not seeded or invoice error — swallow so endorsement still applies
        console.error("Failed to post GL or Invoice config", err);
      }
    }

    // Mark as approved and applied
    return prisma.endorsement.update({
      where: { id: endorsement.id },
      data: {
        status: "APPLIED",
        reviewedBy: approvedBy,
        reviewedAt: new Date(),
        appliedBy: approvedBy,
        appliedAt: new Date(),
      },
    });
  }
}
