"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { uploadFile } from "@/lib/minio";
import { writeAudit } from "@/lib/audit";
import { MemberHealthVaultService } from "@/server/services/member-health-vault.service";
import type { MemberHealthFileCategory, MemberHealthJournalType } from "@prisma/client";
import { revalidatePath } from "next/cache";

const ALLOWED_HEALTH_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_HEALTH_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_VOICE_NOTE_TYPES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"];
const MAX_VOICE_NOTE_BYTES = 20 * 1024 * 1024;

function optionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function optionalDate(value: FormDataEntryValue | null) {
  const text = optionalString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = optionalString(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalInt(value: FormDataEntryValue | null) {
  const parsed = optionalNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function expiryFromForm(value: FormDataEntryValue | null, fallbackHours: number | null) {
  const text = optionalString(value);
  if (text === "none") return null;
  const hours = text ? Number(text) : fallbackHours;
  if (!hours || !Number.isFinite(hours) || hours <= 0) return null;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  return expiresAt;
}

export async function uploadHealthFileAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  const file = formData.get("file");
  const title = optionalString(formData.get("title"));
  const category = (optionalString(formData.get("category")) ?? "OTHER") as MemberHealthFileCategory;

  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
  if (!ALLOWED_HEALTH_FILE_TYPES.includes(file.type)) throw new Error("Accepted file types are PDF, images, Word documents, and web images.");
  if (file.size > MAX_HEALTH_FILE_BYTES) throw new Error("File exceeds the 10 MB limit.");

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileUrl = await uploadFile(buffer, file.name, file.type);

  const record = await MemberHealthVaultService.addFile({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    title: title ?? file.name,
    category,
    fileName: file.name,
    fileUrl,
    fileSize: file.size,
    mimeType: file.type,
    capturedAt: optionalDate(formData.get("capturedAt")),
    notes: optionalString(formData.get("notes")),
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_HEALTH_FILE_UPLOADED",
    module: "MEMBER_PORTAL",
    description: "Member uploaded a health-vault file.",
    metadata: { healthFileId: record.id, category },
  });

  revalidatePath("/member/health-vault");
}

export async function addVitalEntryAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);

  const record = await MemberHealthVaultService.addVital({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    recordedAt: optionalDate(formData.get("recordedAt")) ?? new Date(),
    systolicBp: optionalInt(formData.get("systolicBp")),
    diastolicBp: optionalInt(formData.get("diastolicBp")),
    heartRate: optionalInt(formData.get("heartRate")),
    temperatureC: optionalNumber(formData.get("temperatureC")),
    oxygenSaturation: optionalInt(formData.get("oxygenSaturation")),
    weightKg: optionalNumber(formData.get("weightKg")),
    bloodSugar: optionalNumber(formData.get("bloodSugar")),
    notes: optionalString(formData.get("notes")),
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_VITAL_RECORDED",
    module: "MEMBER_PORTAL",
    description: "Member recorded a health-vault vital entry.",
    metadata: { vitalEntryId: record.id },
  });

  revalidatePath("/member/health-vault");
}

export async function addJournalEntryAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  const noteText = optionalString(formData.get("noteText"));
  if (!noteText) throw new Error("Add a note before saving.");

  const entryType = (optionalString(formData.get("entryType")) ?? "NOTE") as MemberHealthJournalType;
  const record = await MemberHealthVaultService.addJournalEntry({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    entryType,
    noteText,
    tags: optionalString(formData.get("tags")),
    recordedAt: optionalDate(formData.get("recordedAt")) ?? new Date(),
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_HEALTH_JOURNAL_ADDED",
    module: "MEMBER_PORTAL",
    description: "Member added a health-vault journal entry.",
    metadata: { journalEntryId: record.id, entryType },
  });

  revalidatePath("/member/health-vault");
}

export async function uploadVoiceJournalEntryAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  const audio = formData.get("audio");
  const noteText = optionalString(formData.get("noteText")) ?? "Voice note";
  const tags = optionalString(formData.get("tags"));

  if (!(audio instanceof File) || audio.size === 0) throw new Error("Record a voice note before saving.");
  if (!ALLOWED_VOICE_NOTE_TYPES.includes(audio.type)) throw new Error("Accepted voice note formats are webm, mp4, mp3, ogg, and wav.");
  if (audio.size > MAX_VOICE_NOTE_BYTES) throw new Error("Voice note exceeds the 20 MB limit.");

  const buffer = Buffer.from(await audio.arrayBuffer());
  const fileUrl = await uploadFile(buffer, audio.name || `voice-note-${Date.now()}.webm`, audio.type);

  const record = await MemberHealthVaultService.addJournalEntry({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    entryType: "VOICE_NOTE",
    noteText,
    tags,
    recordedAt: new Date(),
    audioUrl: fileUrl,
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_HEALTH_VOICE_NOTE_ADDED",
    module: "MEMBER_PORTAL",
    description: "Member added a health-vault voice note.",
    metadata: { journalEntryId: record.id, fileSize: audio.size, mimeType: audio.type },
  });

  revalidatePath("/member/health-vault");
}

export async function shareHealthRecordWithPreAuthAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  const preauthId = optionalString(formData.get("preauthId"));
  const healthFileId = optionalString(formData.get("healthFileId"));
  const journalEntryId = optionalString(formData.get("journalEntryId"));
  const expiresAt = expiryFromForm(formData.get("shareExpiry"), 168);

  if (!preauthId) throw new Error("Choose a pre-authorization request to share with.");

  const share = await MemberHealthVaultService.shareWithPreAuth({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    preauthId,
    healthFileId,
    journalEntryId,
    expiresAt,
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_HEALTH_RECORD_SHARED",
    module: "MEMBER_PORTAL",
    description: "Member shared a health-vault record with a pre-authorization request.",
    metadata: { shareId: share.id, preauthId, healthFileId, journalEntryId, expiresAt: expiresAt?.toISOString() ?? null },
  });

  revalidatePath("/member/health-vault");
  revalidatePath(`/member/preauth/${preauthId}`);
}

export async function shareHealthRecordWithProviderAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  const providerId = optionalString(formData.get("providerId"));
  const healthFileId = optionalString(formData.get("healthFileId"));
  const journalEntryId = optionalString(formData.get("journalEntryId"));
  const expiresAt = expiryFromForm(formData.get("shareExpiry"), 168);

  if (!providerId) throw new Error("Choose a provider to share with.");

  const share = await MemberHealthVaultService.shareWithProvider({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    providerId,
    healthFileId,
    journalEntryId,
    expiresAt,
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_HEALTH_RECORD_SHARED_WITH_PROVIDER",
    module: "MEMBER_PORTAL",
    description: "Member shared a health-vault record with a provider.",
    metadata: { shareId: share.id, providerId, healthFileId, journalEntryId, expiresAt: expiresAt?.toISOString() ?? null },
  });

  revalidatePath("/member/health-vault");
  revalidatePath(`/providers/${providerId}`);
}

export async function revokeHealthShareAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  const shareId = optionalString(formData.get("shareId"));
  const preauthId = optionalString(formData.get("preauthId"));
  const providerId = optionalString(formData.get("providerId"));
  if (!shareId) throw new Error("Choose a share to revoke.");

  await MemberHealthVaultService.revokeShare({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    shareId,
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_HEALTH_RECORD_SHARE_REVOKED",
    module: "MEMBER_PORTAL",
    description: "Member revoked a health-vault share.",
    metadata: { shareId, preauthId, providerId },
  });

  revalidatePath("/member/health-vault");
  if (preauthId) revalidatePath(`/member/preauth/${preauthId}`);
  if (providerId) revalidatePath(`/providers/${providerId}`);
}
