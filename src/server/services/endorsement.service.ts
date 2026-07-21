import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";
import { GLService } from "@/server/services/gl.service";
import { nextMemberNumber } from "@/server/services/member-numbering.service";
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

    // PR-034: money is 2dp — never expose raw floating-point pro-rata.
    const adjustment = Math.round(dailyRate * daysRemaining * 100) / 100;

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
    const endorsementNumber = await peekNextDocumentNumber("END", (yp) =>
      prisma.endorsement
        .findFirst({ where: { tenantId, endorsementNumber: { startsWith: yp } }, orderBy: { endorsementNumber: "desc" }, select: { endorsementNumber: true } })
        .then((r) => r?.endorsementNumber ?? null),
    );
    
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

    // PR-033: maker-checker. An endorsement carries a billing adjustment —
    // the user who raised it can never be the one who approves and applies it.
    if (endorsement.requestedBy && endorsement.requestedBy !== "SYSTEM" && endorsement.requestedBy === approvedBy) {
      throw new Error(
        "Segregation of duties: you raised this endorsement, so a different user must review and approve it.",
      );
    }

    // FG-C6: atomically claim the endorsement BEFORE any side effect so two
    // concurrent approvals can't both create the member / post the GL / raise the
    // invoice. The loser matches 0 rows → throws. On a later failure we revert to
    // SUBMITTED, preserving the retry-on-GL-failure invariant (a financial
    // endorsement never stays applied without its GL entry).
    const claimed = await prisma.endorsement.updateMany({
      where: { id: endorsementId, tenantId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      data: {
        status:     "APPLIED",
        reviewedBy: approvedBy,
        reviewedAt: new Date(),
        appliedBy:  approvedBy,
        appliedAt:  new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new Error(
        "This endorsement was just actioned by another reviewer — refresh to see its current status.",
      );
    }

    try {
      // Execute the changes
      if (endorsement.type === "MEMBER_ADDITION") {
      const details = endorsement.changeDetails as Record<string, string>;

      const group = await prisma.group.findUnique({ where: { id: endorsement.groupId }});
      // Client-configurable member number prefix (G9.6)
      const memberNumber = await nextMemberNumber(tenantId, group?.clientId);
      
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
        const invoiceNumber = await peekNextDocumentNumber("INV", (yp) =>
          prisma.invoice
            .findFirst({ where: { tenantId, invoiceNumber: { startsWith: yp } }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true } })
            .then((r) => r?.invoiceNumber ?? null),
        );
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
        // NO swallow (PR-018 policy): an endorsement with a financial impact
        // must not apply without its GL entry + adjustment invoice. Surface
        // the error; the endorsement stays pending for retry once fixed.
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Endorsement not applied: posting the financial adjustment failed (${msg}). ` +
          "Fix the GL/billing configuration and approve again.",
        );
      }
    }
    } catch (err) {
      // FG-C6: a side effect failed after the atomic claim — revert to SUBMITTED
      // so the endorsement stays pending and retryable (preserves the GL/invoice
      // "never applied without its financial posting" invariant).
      await prisma.endorsement
        .updateMany({
          where: { id: endorsementId },
          data: { status: "SUBMITTED", appliedAt: null, appliedBy: null, reviewedAt: null, reviewedBy: null },
        })
        .catch(() => undefined);
      throw err;
    }

    // Status/reviewer/applied fields were set by the atomic claim above.
    return prisma.endorsement.findUnique({ where: { id: endorsementId } });
  }
}
