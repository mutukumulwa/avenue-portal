"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { BrokerType, ClientType, CommissionBasis, CommissionScheduleType, IntermediaryCategory, KycDocumentType } from "@prisma/client";
import { CommissionService } from "@/server/services/commission.service";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

function optionalString(formData: FormData, key: string) {
  return ((formData.get(key) as string | null) || "").trim() || null;
}

function optionalDate(formData: FormData, key: string) {
  const value = optionalString(formData, key);
  return value ? new Date(`${value}T00:00:00`) : null;
}

function brokerType(formData: FormData) {
  const value = formData.get("brokerType") as BrokerType | null;
  return value && Object.values(BrokerType).includes(value) ? value : "MASTER_BROKER";
}

function intermediaryCategory(formData: FormData) {
  const value = formData.get("intermediaryCategory") as IntermediaryCategory | null;
  return value && Object.values(IntermediaryCategory).includes(value) ? value : "REGULATED_BROKER";
}

function commissionBasis(formData: FormData) {
  const value = formData.get("commissionBasis") as CommissionBasis | null;
  return value && Object.values(CommissionBasis).includes(value) ? value : "COMMISSION";
}

function scheduleType(formData: FormData) {
  const value = formData.get("scheduleType") as CommissionScheduleType | null;
  return value && Object.values(CommissionScheduleType).includes(value) ? value : "FLAT_PERCENTAGE";
}

function kycDocumentType(formData: FormData) {
  const value = formData.get("documentType") as KycDocumentType | null;
  return value && Object.values(KycDocumentType).includes(value) ? value : "OTHER";
}

function clientType(formData: FormData) {
  const value = optionalString(formData, "clientType") as ClientType | null;
  return value && Object.values(ClientType).includes(value) ? value : null;
}

function percentToRate(formData: FormData, key: string) {
  return Number(formData.get(key) || 0) / 100;
}

async function requireTenantBroker(brokerId: string) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const broker = await prisma.broker.findUnique({
    where: { id: brokerId, tenantId: session.user.tenantId },
    select: { id: true, name: true },
  });
  if (!broker) throw new Error("Broker not found.");
  return { session, broker };
}

export async function createBrokerAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const name = (formData.get("name") as string).trim();
  const contactPerson = (formData.get("contactPerson") as string).trim();
  const phone = (formData.get("phone") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();

  if (!name || !contactPerson || !phone || !email) {
    return { error: "Name, contact person, phone, and email are required." };
  }

  const broker = await prisma.broker.create({
    data: {
      tenantId: session.user.tenantId,
      name,
      contactPerson,
      phone,
      email,
      brokerCode: optionalString(formData, "brokerCode"),
      legalName: optionalString(formData, "legalName") ?? name,
      tradingName: optionalString(formData, "tradingName"),
      brokerType: brokerType(formData),
      intermediaryCategory: intermediaryCategory(formData),
      requiresIraRegistration: formData.get("requiresIraRegistration") === "on",
      canReceiveCommission: formData.get("canReceiveCommission") === "on",
      commissionBasis: commissionBasis(formData),
      referralFeeAmount: formData.get("referralFeeAmount") ? Number(formData.get("referralFeeAmount")) : null,
      sourceDescription: optionalString(formData, "sourceDescription"),
      parentBrokerId: optionalString(formData, "parentBrokerId"),
      address: optionalString(formData, "address"),
      licenseNumber: optionalString(formData, "licenseNumber"),
      iraExpiryDate: optionalDate(formData, "iraExpiryDate"),
      kraPin: optionalString(formData, "kraPin"),
      vatRegistered: formData.get("vatRegistered") === "on",
      vatNumber: optionalString(formData, "vatNumber"),
      bankAccountReference: optionalString(formData, "bankAccountReference"),
      mpesaPaybillNumber: optionalString(formData, "mpesaPaybillNumber"),
      effectiveFrom: optionalDate(formData, "effectiveFrom") ?? new Date(),
      effectiveTo: optionalDate(formData, "effectiveTo"),
      firstYearCommissionPct: Number(formData.get("firstYearCommissionPct") || 0),
      renewalCommissionPct: Number(formData.get("renewalCommissionPct") || 0),
      flatFeePerMember: formData.get("flatFeePerMember") ? Number(formData.get("flatFeePerMember")) : null,
      status: (formData.get("status") as string) || "ACTIVE",
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_CREATED",
    module: "BROKERS",
    description: `Business source created: ${broker.name}`,
    metadata: { brokerId: broker.id, intermediaryCategory: broker.intermediaryCategory, commissionBasis: broker.commissionBasis },
  });

  redirect(`/brokers/${broker.id}`);
}

export async function updateBrokerAction(
  brokerId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  await prisma.broker.update({
    where: { id: brokerId, tenantId: session.user.tenantId },
    data: {
      name: (formData.get("name") as string).trim(),
      contactPerson: (formData.get("contactPerson") as string).trim(),
      phone: (formData.get("phone") as string).trim(),
      email: (formData.get("email") as string).trim().toLowerCase(),
      brokerCode: optionalString(formData, "brokerCode"),
      legalName: optionalString(formData, "legalName"),
      tradingName: optionalString(formData, "tradingName"),
      brokerType: brokerType(formData),
      intermediaryCategory: intermediaryCategory(formData),
      requiresIraRegistration: formData.get("requiresIraRegistration") === "on",
      canReceiveCommission: formData.get("canReceiveCommission") === "on",
      commissionBasis: commissionBasis(formData),
      referralFeeAmount: formData.get("referralFeeAmount") ? Number(formData.get("referralFeeAmount")) : null,
      sourceDescription: optionalString(formData, "sourceDescription"),
      parentBrokerId: optionalString(formData, "parentBrokerId"),
      address: optionalString(formData, "address"),
      licenseNumber: optionalString(formData, "licenseNumber"),
      iraExpiryDate: optionalDate(formData, "iraExpiryDate"),
      kraPin: optionalString(formData, "kraPin"),
      vatRegistered: formData.get("vatRegistered") === "on",
      vatNumber: optionalString(formData, "vatNumber"),
      bankAccountReference: optionalString(formData, "bankAccountReference"),
      mpesaPaybillNumber: optionalString(formData, "mpesaPaybillNumber"),
      effectiveFrom: optionalDate(formData, "effectiveFrom") ?? new Date(),
      effectiveTo: optionalDate(formData, "effectiveTo"),
      firstYearCommissionPct: Number(formData.get("firstYearCommissionPct") || 0),
      renewalCommissionPct: Number(formData.get("renewalCommissionPct") || 0),
      flatFeePerMember: formData.get("flatFeePerMember") ? Number(formData.get("flatFeePerMember")) : null,
      status: (formData.get("status") as string) || "ACTIVE",
    },
  });

  redirect(`/brokers/${brokerId}`);
}

export async function createCommissionScheduleAction(brokerId: string, formData: FormData) {
  const { session, broker } = await requireTenantBroker(brokerId);

  const scheduleName = optionalString(formData, "scheduleName");
  if (!scheduleName) throw new Error("Schedule name is required.");

  const groupId = optionalString(formData, "groupId");
  if (groupId) {
    const group = await prisma.group.findUnique({
      where: { id: groupId, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!group) throw new Error("Selected group is not available for this tenant.");
  }

  const schedule = await prisma.brokerCommissionSchedule.create({
    data: {
      brokerId,
      scheduleName,
      scheduleType: scheduleType(formData),
      groupId,
      clientType: clientType(formData),
      newBusinessRate: percentToRate(formData, "newBusinessRate"),
      renewalRate: percentToRate(formData, "renewalRate"),
      overrideRate: formData.get("overrideRate") ? percentToRate(formData, "overrideRate") : null,
      grossCommissionCeiling: formData.get("grossCommissionCeiling") ? percentToRate(formData, "grossCommissionCeiling") : null,
      payoutCycleDays: Number(formData.get("payoutCycleDays") || 30),
      effectiveFrom: optionalDate(formData, "effectiveFrom") ?? new Date(),
      effectiveTo: optionalDate(formData, "effectiveTo"),
      createdById: session.user.id,
      status: "DRAFT",
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_COMMISSION_SCHEDULE_DRAFTED",
    module: "BROKERS",
    description: `Commission schedule drafted for broker: ${broker.name}`,
    metadata: { brokerId, scheduleId: schedule.id },
  });

  redirect(`/brokers/${brokerId}?tab=schedules`);
}

export async function submitCommissionScheduleAction(brokerId: string, scheduleId: string) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertScheduleBelongsToBroker(scheduleId, brokerId);
  await CommissionService.submitScheduleForApproval(scheduleId, session.user.id);

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_COMMISSION_SCHEDULE_SUBMITTED",
    module: "BROKERS",
    description: `Commission schedule submitted for approval: ${broker.name}`,
    metadata: { brokerId, scheduleId },
  });

  redirect(`/brokers/${brokerId}?tab=schedules`);
}

export async function approveCommissionScheduleAction(brokerId: string, scheduleId: string) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertScheduleBelongsToBroker(scheduleId, brokerId);
  await CommissionService.approveSchedule(scheduleId, session.user.id);

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_COMMISSION_SCHEDULE_APPROVED",
    module: "BROKERS",
    description: `Commission schedule approved: ${broker.name}`,
    metadata: { brokerId, scheduleId },
  });

  redirect(`/brokers/${brokerId}?tab=schedules`);
}

export async function rejectCommissionScheduleAction(brokerId: string, scheduleId: string) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertScheduleBelongsToBroker(scheduleId, brokerId);

  await prisma.brokerCommissionSchedule.update({
    where: { id: scheduleId },
    data: { status: "REJECTED" },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_COMMISSION_SCHEDULE_REJECTED",
    module: "BROKERS",
    description: `Commission schedule rejected: ${broker.name}`,
    metadata: { brokerId, scheduleId },
  });

  redirect(`/brokers/${brokerId}?tab=schedules`);
}

export async function recordBrokerKycDocumentAction(brokerId: string, formData: FormData) {
  const { session, broker } = await requireTenantBroker(brokerId);

  const fileName = optionalString(formData, "fileName");
  const fileUri = optionalString(formData, "fileUri");
  if (!fileName || !fileUri) throw new Error("Document name and reference are required.");

  const document = await prisma.brokerKycDocument.create({
    data: {
      brokerId,
      documentType: kycDocumentType(formData),
      fileName,
      fileUri,
      expiresAt: optionalDate(formData, "expiresAt"),
      notes: optionalString(formData, "notes"),
      uploadedById: session.user.id,
      status: "PENDING_REVIEW",
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_KYC_DOCUMENT_RECORDED",
    module: "BROKERS",
    description: `KYC document recorded for broker: ${broker.name}`,
    metadata: { brokerId, documentId: document.id, documentType: document.documentType },
  });

  redirect(`/brokers/${brokerId}?tab=kyc`);
}

export async function verifyBrokerKycDocumentAction(brokerId: string, documentId: string) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertKycDocumentBelongsToBroker(documentId, brokerId);

  await prisma.brokerKycDocument.update({
    where: { id: documentId },
    data: {
      status: "VERIFIED",
      verifiedAt: new Date(),
      verifiedById: session.user.id,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_KYC_DOCUMENT_VERIFIED",
    module: "BROKERS",
    description: `KYC document verified for broker: ${broker.name}`,
    metadata: { brokerId, documentId },
  });

  redirect(`/brokers/${brokerId}?tab=kyc`);
}

export async function rejectBrokerKycDocumentAction(brokerId: string, documentId: string, formData: FormData) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertKycDocumentBelongsToBroker(documentId, brokerId);

  await prisma.brokerKycDocument.update({
    where: { id: documentId },
    data: {
      status: "REJECTED",
      verifiedAt: new Date(),
      verifiedById: session.user.id,
      notes: optionalString(formData, "notes") ?? "Rejected during KYC review.",
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_KYC_DOCUMENT_REJECTED",
    module: "BROKERS",
    description: `KYC document rejected for broker: ${broker.name}`,
    metadata: { brokerId, documentId },
  });

  redirect(`/brokers/${brokerId}?tab=kyc`);
}

export async function createBrokerProducerAction(brokerId: string, formData: FormData) {
  const { session, broker } = await requireTenantBroker(brokerId);

  const producerName = optionalString(formData, "producerName");
  const producerCode = optionalString(formData, "producerCode");
  const email = optionalString(formData, "email")?.toLowerCase();
  const phone = optionalString(formData, "phone");
  if (!producerName || !producerCode || !email || !phone) {
    throw new Error("Producer name, code, email, and phone are required.");
  }

  const selectedGroupIds = formData.getAll("groupIds").map(String).filter(Boolean);
  const assignableGroups = selectedGroupIds.length > 0
    ? await prisma.group.findMany({
        where: {
          id: { in: selectedGroupIds },
          tenantId: session.user.tenantId,
          brokerId,
        },
        select: { id: true },
      })
    : [];
  if (assignableGroups.length !== selectedGroupIds.length) {
    throw new Error("One or more selected schemes cannot be assigned to this producer.");
  }

  const producer = await prisma.brokerProducer.create({
    data: {
      brokerId,
      producerName,
      producerCode,
      iraIndividualNumber: optionalString(formData, "iraIndividualNumber"),
      email,
      phone,
      effectiveFrom: optionalDate(formData, "effectiveFrom") ?? new Date(),
      effectiveTo: optionalDate(formData, "effectiveTo"),
      status: (optionalString(formData, "status") ?? "ACTIVE").toUpperCase(),
      groups: assignableGroups.length > 0 ? { connect: assignableGroups.map(group => ({ id: group.id })) } : undefined,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_PRODUCER_CREATED",
    module: "BROKERS",
    description: `Producer created for broker: ${broker.name}`,
    metadata: { brokerId, producerId: producer.id, groupIds: assignableGroups.map(group => group.id).join(",") },
  });

  redirect(`/brokers/${brokerId}?tab=producers`);
}

export async function setBrokerProducerStatusAction(brokerId: string, producerId: string, status: string) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertProducerBelongsToBroker(producerId, brokerId);

  const normalizedStatus = status.toUpperCase() === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  await prisma.brokerProducer.update({
    where: { id: producerId },
    data: {
      status: normalizedStatus,
      effectiveTo: normalizedStatus === "INACTIVE" ? new Date() : null,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_PRODUCER_STATUS_UPDATED",
    module: "BROKERS",
    description: `Producer status updated for broker: ${broker.name}`,
    metadata: { brokerId, producerId, status: normalizedStatus },
  });

  redirect(`/brokers/${brokerId}?tab=producers`);
}

export async function generateBrokerPayoutBatchAction(brokerId: string, formData: FormData) {
  const { session, broker } = await requireTenantBroker(brokerId);
  const asOfDate = optionalDate(formData, "asOfDate") ?? new Date();

  const batch = await CommissionService.generatePayoutBatch({
    asOfDate,
    brokerIds: [brokerId],
    generatedById: session.user.id,
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_PAYOUT_BATCH_GENERATED",
    module: "BROKERS",
    description: `Payout batch generated for broker: ${broker.name}`,
    metadata: { brokerId, batchId: batch.id, batchReference: batch.batchReference },
  });

  redirect(`/brokers/${brokerId}?tab=payouts`);
}

export async function submitBrokerPayoutBatchAction(brokerId: string, batchId: string) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertPayoutBatchIncludesBroker(batchId, brokerId);

  const batch = await prisma.commissionPayoutBatch.update({
    where: { id: batchId },
    data: { status: "PENDING_APPROVAL" },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_PAYOUT_BATCH_SUBMITTED",
    module: "BROKERS",
    description: `Payout batch submitted for broker: ${broker.name}`,
    metadata: { brokerId, batchId, batchReference: batch.batchReference },
  });

  redirect(`/brokers/${brokerId}?tab=payouts`);
}

export async function approveBrokerPayoutBatchAction(brokerId: string, batchId: string) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertPayoutBatchIncludesBroker(batchId, brokerId);

  const batch = await prisma.commissionPayoutBatch.update({
    where: { id: batchId },
    data: {
      status: "APPROVED",
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_PAYOUT_BATCH_APPROVED",
    module: "BROKERS",
    description: `Payout batch approved for broker: ${broker.name}`,
    metadata: { brokerId, batchId, batchReference: batch.batchReference },
  });

  redirect(`/brokers/${brokerId}?tab=payouts`);
}

export async function completeBrokerPayoutBatchAction(brokerId: string, batchId: string, formData: FormData) {
  const { session, broker } = await requireTenantBroker(brokerId);
  await assertPayoutBatchIncludesBroker(batchId, brokerId);
  const paymentReference = optionalString(formData, "paymentReference");

  const batch = await prisma.$transaction(async tx => {
    const updatedBatch = await tx.commissionPayoutBatch.update({
      where: { id: batchId },
      data: {
        status: "COMPLETED",
        disbursedAt: new Date(),
      },
    });

    await tx.commissionLedgerEntry.updateMany({
      where: { payoutBatchId: batchId, brokerId },
      data: {
        state: "PAID",
        stateAsOf: new Date(),
        paidAt: new Date(),
        paymentReference,
      },
    });

    return updatedBatch;
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_PAYOUT_BATCH_COMPLETED",
    module: "BROKERS",
    description: `Payout batch completed for broker: ${broker.name}`,
    metadata: { brokerId, batchId, batchReference: batch.batchReference, paymentReference },
  });

  redirect(`/brokers/${brokerId}?tab=payouts`);
}

async function assertScheduleBelongsToBroker(scheduleId: string, brokerId: string) {
  const schedule = await prisma.brokerCommissionSchedule.findUnique({
    where: { id: scheduleId },
    select: { brokerId: true },
  });
  if (!schedule || schedule.brokerId !== brokerId) throw new Error("Commission schedule not found.");
}

async function assertKycDocumentBelongsToBroker(documentId: string, brokerId: string) {
  const document = await prisma.brokerKycDocument.findUnique({
    where: { id: documentId },
    select: { brokerId: true },
  });
  if (!document || document.brokerId !== brokerId) throw new Error("KYC document not found.");
}

async function assertProducerBelongsToBroker(producerId: string, brokerId: string) {
  const producer = await prisma.brokerProducer.findUnique({
    where: { id: producerId },
    select: { brokerId: true },
  });
  if (!producer || producer.brokerId !== brokerId) throw new Error("Producer not found.");
}

async function assertPayoutBatchIncludesBroker(batchId: string, brokerId: string) {
  const batch = await prisma.commissionPayoutBatch.findFirst({
    where: { id: batchId, entries: { some: { brokerId } } },
    select: { id: true },
  });
  if (!batch) throw new Error("Payout batch not found.");
}
