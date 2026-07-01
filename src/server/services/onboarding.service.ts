import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { CardType, CardStatus, OnboardingItemType, OnboardingItemStatus, KycDocType } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { niraService } from "./integrations/nira.service";

// ─── ONBOARDING SERVICE ───────────────────────────────────────────────────────

export const onboardingService = {

  // ── 1. Initiate onboarding checklist ─────────────────────────────────────

  /**
   * Creates an OnboardingChecklistItem for each required step.
   * Called automatically after membership activation, or manually by Member Ops.
   */
  async initiateOnboarding(memberId: string, tenantId: string) {
    // Determine which items are required based on scheme configuration.
    // Default: all items required except BIOMETRIC_ENROLLED (optional).
    const requiredItems: OnboardingItemType[] = [
      "KYC_COMPLETION",
      "PORTAL_PROVISIONING",
      "DIGITAL_CARD_GENERATED",
      "WELCOME_COMMUNICATION_SENT",
      "PROVIDER_NOTIFIED",
    ];

    const existingItems = await prisma.onboardingChecklistItem.findMany({
      where: { memberId, tenantId },
      select: { itemType: true },
    });
    const existingTypes = new Set(existingItems.map((i) => i.itemType));

    const toCreate = requiredItems.filter((t) => !existingTypes.has(t));
    if (toCreate.length === 0) return;

    await prisma.onboardingChecklistItem.createMany({
      data: toCreate.map((itemType) => ({ tenantId, memberId, itemType })),
      skipDuplicates: true,
    });
  },

  // ── 2. Complete KYC ───────────────────────────────────────────────────────

  async completeKyc(
    memberId: string,
    tenantId: string,
    data: {
      govIdType?: string;
      govIdNumber?: string;
      photoUrl?: string;
    },
    operatorId: string,
  ) {
    // Upsert the KYC record
    const record = await prisma.memberKycRecord.upsert({
      where: { memberId },
      update: {
        ...data,
        status: "IN_PROGRESS",
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        memberId,
        ...data,
        status: "IN_PROGRESS",
      },
    });

    // Run NIRA identity check (stub)
    if (data.govIdNumber) {
      const result = await niraService.validate(data.govIdNumber);
      await prisma.memberKycRecord.update({
        where: { memberId },
        data: {
          iprsValidated: result.valid && result.source === "nira_api",
          iprsCheckedAt: new Date(),
          iprsNote: result.note,
        },
      });
    }

    return record;
  },

  // ── 3. Upload KYC document ────────────────────────────────────────────────

  async addKycDocument(
    memberId: string,
    tenantId: string,
    docType: KycDocType,
    fileUrl: string,
    verifiedById?: string,
  ) {
    const kycRecord = await prisma.memberKycRecord.findUnique({ where: { memberId } });
    if (!kycRecord) {
      throw new TRPCError({ code: "NOT_FOUND", message: "KYC record not found — call completeKyc first" });
    }

    const doc = await prisma.memberKycDocument.create({
      data: {
        tenantId,
        kycRecordId: kycRecord.id,
        docType,
        fileUrl,
        verifiedById,
        verifiedAt: verifiedById ? new Date() : undefined,
        isVerified: !!verifiedById,
      },
    });

    // If all required doc types are uploaded and verified, mark KYC COMPLETED
    const docs = await prisma.memberKycDocument.findMany({
      where: { kycRecordId: kycRecord.id },
    });
    const verifiedDocs = docs.filter((d) => d.isVerified);
    const hasIdDoc = verifiedDocs.some((d) => ["NATIONAL_ID_COPY","PASSPORT_COPY"].includes(d.docType));
    if (hasIdDoc) {
      await prisma.memberKycRecord.update({
        where: { memberId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await onboardingService.markItemComplete(memberId, tenantId, "KYC_COMPLETION");
    }

    return doc;
  },

  // ── 4. Issue digital card ─────────────────────────────────────────────────

  async issueDigitalCard(memberId: string, tenantId: string) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { memberNumber: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    // Deactivate any existing digital card
    await prisma.membershipCard.updateMany({
      where: { memberId, tenantId, cardType: "DIGITAL", isActive: true },
      data: { isActive: false, deactivatedAt: new Date() },
    });

    const cardNumber = `MVX-CARD-${member.memberNumber.slice(4)}-D`;
    const card = await prisma.membershipCard.create({
      data: {
        tenantId,
        memberId,
        cardType: "DIGITAL",
        status: "ISSUED",
        cardNumber,
        issuedAt: new Date(),
        activatedAt: new Date(), // digital cards are immediately active
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });

    await onboardingService.markItemComplete(memberId, tenantId, "DIGITAL_CARD_GENERATED");
    await auditChainService.append({
      actorId: "system",
      action: "CARD:DIGITAL_ISSUED",
      module: "ONBOARDING",
      entityType: "Member",
      entityId: memberId,
      payload: { cardNumber, memberId },
      tenantId,
      description: `Digital card ${cardNumber} issued for member ${member.memberNumber}`,
    });

    return card;
  },

  // ── 5. Queue physical card ────────────────────────────────────────────────

  async queuePhysicalCard(memberId: string, tenantId: string, isSmartCard = false) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { memberNumber: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    const cardType: CardType = isSmartCard ? "SMART" : "PHYSICAL";
    const suffix = isSmartCard ? "S" : "P";
    const cardNumber = `MVX-CARD-${member.memberNumber.slice(4)}-${suffix}`;

    const card = await prisma.membershipCard.create({
      data: {
        tenantId,
        memberId,
        cardType,
        status: "PENDING_ISSUANCE",
        cardNumber,
        isActive: true,
      },
    });

    // Would dispatch to issuance partner queue here
    // For now log to audit chain as the "queue" event
    await auditChainService.append({
      actorId: "system",
      action: "CARD:PHYSICAL_QUEUED",
      module: "ONBOARDING",
      entityType: "Member",
      entityId: memberId,
      payload: { cardType, cardNumber },
      tenantId,
      description: `${isSmartCard ? "Smart" : "Physical"} card queued for issuance: ${cardNumber}`,
    });

    return card;
  },

  // ── 6. Update card status (dispatch → delivered → activated) ──────────────

  async updateCardStatus(cardId: string, tenantId: string, newStatus: CardStatus, actorId: string) {
    const card = await prisma.membershipCard.findUnique({ where: { id: cardId } });
    if (!card || card.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
    }

    const timestamps: Record<string, Date> = {};
    if (newStatus === "DISPATCHED")  timestamps.dispatchedAt  = new Date();
    if (newStatus === "DELIVERED")   timestamps.deliveredAt   = new Date();
    if (newStatus === "ACTIVATED")   timestamps.activatedAt   = new Date();

    const updated = await prisma.membershipCard.update({
      where: { id: cardId },
      data: { status: newStatus, ...timestamps },
    });

    if (newStatus === "DISPATCHED") {
      await onboardingService.markItemComplete(card.memberId, tenantId, "PHYSICAL_CARD_DISPATCHED");
    }

    return updated;
  },

  // ── 7. Request card replacement ───────────────────────────────────────────

  async requestCardReplacement(memberId: string, tenantId: string, reason: string, actorId: string) {
    const activeCard = await prisma.membershipCard.findFirst({
      where: { memberId, tenantId, isActive: true },
      orderBy: { issuedAt: "desc" },
    });
    if (!activeCard) throw new TRPCError({ code: "NOT_FOUND", message: "No active card found" });

    // Deactivate old card
    await prisma.membershipCard.update({
      where: { id: activeCard.id },
      data: { isActive: false, deactivatedAt: new Date(), status: "REPLACED", replacementReason: reason },
    });

    // Queue the replacement (same type as original)
    const isSmartCard = activeCard.cardType === "SMART";
    const newCard = await onboardingService.queuePhysicalCard(memberId, tenantId, isSmartCard);

    await prisma.membershipCard.update({
      where: { id: activeCard.id },
      data: { replacedByCardId: newCard.id },
    });

    await auditChainService.append({
      actorId,
      action: "CARD:REPLACEMENT_REQUESTED",
      module: "ONBOARDING",
      entityType: "Member",
      entityId: memberId,
      payload: { reason, oldCardId: activeCard.id, newCardId: newCard.id },
      tenantId,
      description: `Card replacement requested: ${reason}`,
    });

    return newCard;
  },

  // ── 8. Send welcome communications ───────────────────────────────────────

  async sendWelcomeCommunications(memberId: string, tenantId: string, actorId: string) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { firstName: true, lastName: true, memberNumber: true, email: true, phone: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    // Log the communication intent (actual dispatch uses notification service)
    await prisma.activityLog.create({
      data: {
        entityType: "MEMBER",
        entityId: memberId,
        memberId,
        action: "WELCOME_COMMUNICATIONS_SENT",
        description: `Welcome communications dispatched for ${member.firstName} ${member.lastName} (${member.memberNumber})`,
        userId: actorId,
      },
    });

    await onboardingService.markItemComplete(memberId, tenantId, "WELCOME_COMMUNICATION_SENT");

    await auditChainService.append({
      actorId,
      action: "ONBOARDING:WELCOME_SENT",
      module: "ONBOARDING",
      entityType: "Member",
      entityId: memberId,
      payload: { memberNumber: member.memberNumber },
      tenantId,
      description: `Welcome communications dispatched for member ${member.memberNumber}`,
    });
  },

  // ── 9. Notify provider network ────────────────────────────────────────────

  async notifyProviderNetwork(memberIds: string[], tenantId: string) {
    // Stub — real integration would push to SMART/Slade360 eligibility API
    for (const memberId of memberIds) {
      await onboardingService.markItemComplete(memberId, tenantId, "PROVIDER_NOTIFIED");
    }
    return { notified: memberIds.length, source: "stub" };
  },

  // ── 10. Mark portal provisioned ───────────────────────────────────────────

  async markPortalProvisioned(memberId: string, tenantId: string, actorId: string) {
    await onboardingService.markItemComplete(memberId, tenantId, "PORTAL_PROVISIONING");
    await auditChainService.append({
      actorId,
      action: "ONBOARDING:PORTAL_PROVISIONED",
      module: "ONBOARDING",
      entityType: "Member",
      entityId: memberId,
      payload: { memberId },
      tenantId,
      description: "Member portal account provisioned",
    });
  },

  // ── 11. Run readiness check ───────────────────────────────────────────────

  async runReadinessCheck(memberId: string, tenantId: string): Promise<{
    ready: boolean;
    outstanding: string[];
    completed: string[];
  }> {
    const items = await prisma.onboardingChecklistItem.findMany({
      where: { memberId, tenantId },
    });

    const mandatory: OnboardingItemType[] = [
      "KYC_COMPLETION",
      "DIGITAL_CARD_GENERATED",
      "WELCOME_COMMUNICATION_SENT",
    ];

    const outstanding = mandatory.filter((type) => {
      const item = items.find((i) => i.itemType === type);
      return !item || item.status !== "COMPLETED";
    });

    const completed = items
      .filter((i) => i.status === "COMPLETED")
      .map((i) => i.itemType);

    return {
      ready: outstanding.length === 0,
      outstanding,
      completed,
    };
  },

  // ── 12. Helper: mark checklist item complete ──────────────────────────────

  async markItemComplete(memberId: string, tenantId: string, itemType: OnboardingItemType) {
    await prisma.onboardingChecklistItem.upsert({
      where: { memberId_itemType: { memberId, itemType } },
      update: { status: "COMPLETED", completedAt: new Date() },
      create: {
        tenantId, memberId, itemType,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
  },

  // ── 13. Queries ───────────────────────────────────────────────────────────

  async getOnboardingStatus(memberId: string, tenantId: string) {
    const [items, kycRecord, cards] = await Promise.all([
      prisma.onboardingChecklistItem.findMany({
        where: { memberId, tenantId },
        orderBy: { itemType: "asc" },
      }),
      prisma.memberKycRecord.findUnique({
        where: { memberId },
        include: { documents: true },
      }),
      prisma.membershipCard.findMany({
        where: { memberId, tenantId, isActive: true },
        orderBy: { issuedAt: "desc" },
      }),
    ]);

    return { items, kycRecord, cards };
  },

  async getOnboardingQueue(tenantId: string, page = 1, pageSize = 50) {
    // Members with any outstanding onboarding item created in the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const pendingMemberIds = await prisma.onboardingChecklistItem.findMany({
      where: {
        tenantId,
        status: "PENDING",
        updatedAt: { gte: thirtyDaysAgo },
      },
      select: { memberId: true },
      distinct: ["memberId"],
    });

    const ids = pendingMemberIds.map((i) => i.memberId);
    const total = ids.length;

    const members = await prisma.member.findMany({
      where: { id: { in: ids.slice((page - 1) * pageSize, page * pageSize) }, tenantId },
      select: {
        id: true, memberNumber: true, firstName: true, lastName: true,
        status: true, coverStartDate: true, enrollmentDate: true,
        group: { select: { name: true } },
      },
    });

    // Attach outstanding items per member
    const memberItems = await prisma.onboardingChecklistItem.findMany({
      where: { memberId: { in: members.map((m) => m.id) }, status: "PENDING" },
      select: { memberId: true, itemType: true },
    });

    const memberItemMap = new Map<string, string[]>();
    for (const item of memberItems) {
      if (!memberItemMap.has(item.memberId)) memberItemMap.set(item.memberId, []);
      memberItemMap.get(item.memberId)!.push(item.itemType);
    }

    return {
      items: members.map((m) => ({
        ...m,
        outstandingItems: memberItemMap.get(m.id) ?? [],
      })),
      total,
      page,
      pageSize,
    };
  },
};
