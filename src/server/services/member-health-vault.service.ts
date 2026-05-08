import { prisma } from "@/lib/prisma";
import { MemberAppService } from "@/server/services/member-app.service";
import { CheckInChallengeStatus, type MemberHealthFileCategory, type MemberHealthJournalType } from "@prisma/client";

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tagsFromText(value: string | null | undefined) {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

function activeShareWindow() {
  return [{ expiresAt: null }, { expiresAt: { gt: new Date() } }];
}

export class MemberHealthVaultService {
  static async getVaultForUser(userId: string, tenantId: string) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const [files, vitals, journalEntries, preauths, providers] = await Promise.all([
      prisma.memberHealthFile.findMany({
        where: { tenantId, memberId: context.id },
        include: { shares: { where: { revokedAt: null, OR: activeShareWindow() }, select: { id: true, providerId: true, preauthId: true, checkInChallengeId: true, expiresAt: true, createdAt: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.memberVitalEntry.findMany({
        where: { tenantId, memberId: context.id },
        orderBy: { recordedAt: "desc" },
        take: 50,
      }),
      prisma.memberHealthJournalEntry.findMany({
        where: { tenantId, memberId: context.id },
        include: { shares: { where: { revokedAt: null, OR: activeShareWindow() }, select: { id: true, providerId: true, preauthId: true, checkInChallengeId: true, expiresAt: true, createdAt: true } } },
        orderBy: { recordedAt: "desc" },
        take: 50,
      }),
      prisma.preAuthorization.findMany({
        where: {
          tenantId,
          memberId: context.id,
          status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
        },
        include: { provider: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.provider.findMany({
        where: { tenantId, contractStatus: "ACTIVE" },
        select: { id: true, name: true, tier: true, county: true },
        orderBy: { name: "asc" },
        take: 100,
      }),
    ]);

    return {
      member: {
        id: context.id,
        firstName: context.firstName,
        lastName: context.lastName,
        memberNumber: context.memberNumber,
      },
      summary: {
        fileCount: files.length,
        vitalCount: vitals.length,
        journalCount: journalEntries.length,
        lastVitalAt: vitals[0]?.recordedAt ?? null,
        lastJournalAt: journalEntries[0]?.recordedAt ?? null,
      },
      files: files.map((file) => ({
        id: file.id,
        title: file.title,
        category: file.category,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        capturedAt: file.capturedAt,
        notes: file.notes,
        createdAt: file.createdAt,
        shares: file.shares,
      })),
      vitals: vitals.map((entry) => ({
        id: entry.id,
        recordedAt: entry.recordedAt,
        systolicBp: entry.systolicBp,
        diastolicBp: entry.diastolicBp,
        heartRate: entry.heartRate,
        temperatureC: toNumber(entry.temperatureC),
        oxygenSaturation: entry.oxygenSaturation,
        weightKg: toNumber(entry.weightKg),
        bloodSugar: toNumber(entry.bloodSugar),
        notes: entry.notes,
      })),
      journalEntries: journalEntries.map((entry) => ({
        id: entry.id,
        entryType: entry.entryType,
        noteText: entry.noteText,
        audioUrl: entry.audioUrl,
        transcriptText: entry.transcriptText,
        tags: entry.tags,
        recordedAt: entry.recordedAt,
        createdAt: entry.createdAt,
        shares: entry.shares,
      })),
      preauthTargets: preauths.map((preauth) => ({
        id: preauth.id,
        preauthNumber: preauth.preauthNumber,
        providerName: preauth.provider.name,
        status: preauth.status,
        expectedDateOfService: preauth.expectedDateOfService,
      })),
      providerTargets: providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        tier: provider.tier,
        county: provider.county,
      })),
    };
  }

  static async addFile(input: {
    userId: string;
    tenantId: string;
    title: string;
    category: MemberHealthFileCategory;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    capturedAt?: Date | null;
    notes?: string | null;
  }) {
    const context = await MemberAppService.resolveMemberContext(input.userId, input.tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");

    return prisma.memberHealthFile.create({
      data: {
        tenantId: input.tenantId,
        memberId: context.id,
        uploadedByUserId: input.userId,
        title: input.title,
        category: input.category,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        capturedAt: input.capturedAt,
        notes: input.notes,
      },
    });
  }

  static async addVital(input: {
    userId: string;
    tenantId: string;
    recordedAt?: Date;
    systolicBp?: number | null;
    diastolicBp?: number | null;
    heartRate?: number | null;
    temperatureC?: number | null;
    oxygenSaturation?: number | null;
    weightKg?: number | null;
    bloodSugar?: number | null;
    notes?: string | null;
  }) {
    const context = await MemberAppService.resolveMemberContext(input.userId, input.tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");

    return prisma.memberVitalEntry.create({
      data: {
        tenantId: input.tenantId,
        memberId: context.id,
        recordedByUserId: input.userId,
        recordedAt: input.recordedAt ?? new Date(),
        systolicBp: input.systolicBp,
        diastolicBp: input.diastolicBp,
        heartRate: input.heartRate,
        temperatureC: input.temperatureC,
        oxygenSaturation: input.oxygenSaturation,
        weightKg: input.weightKg,
        bloodSugar: input.bloodSugar,
        notes: input.notes,
      },
    });
  }

  static async addJournalEntry(input: {
    userId: string;
    tenantId: string;
    entryType: MemberHealthJournalType;
    noteText: string;
    tags?: string | null;
    recordedAt?: Date;
    audioUrl?: string | null;
    transcriptText?: string | null;
  }) {
    const context = await MemberAppService.resolveMemberContext(input.userId, input.tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");

    return prisma.memberHealthJournalEntry.create({
      data: {
        tenantId: input.tenantId,
        memberId: context.id,
        authorUserId: input.userId,
        entryType: input.entryType,
        noteText: input.noteText,
        audioUrl: input.audioUrl,
        transcriptText: input.transcriptText,
        tags: tagsFromText(input.tags),
        recordedAt: input.recordedAt ?? new Date(),
      },
    });
  }

  static async shareWithPreAuth(input: {
    userId: string;
    tenantId: string;
    preauthId: string;
    healthFileId?: string | null;
    journalEntryId?: string | null;
    expiresAt?: Date | null;
  }) {
    const context = await MemberAppService.resolveMemberContext(input.userId, input.tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");
    if (!input.healthFileId && !input.journalEntryId) throw new Error("Choose a file or note to share.");

    const preauth = await prisma.preAuthorization.findFirst({
      where: { id: input.preauthId, tenantId: input.tenantId, memberId: context.id },
      select: { id: true },
    });
    if (!preauth) throw new Error("Choose one of your own pre-authorization requests.");

    if (input.healthFileId) {
      const file = await prisma.memberHealthFile.findFirst({
        where: { id: input.healthFileId, tenantId: input.tenantId, memberId: context.id },
        select: { id: true },
      });
      if (!file) throw new Error("Choose one of your own health files.");

      const existing = await prisma.memberHealthShare.findFirst({
        where: {
          tenantId: input.tenantId,
          memberId: context.id,
          preauthId: input.preauthId,
          healthFileId: input.healthFileId,
          revokedAt: null,
          OR: activeShareWindow(),
        },
      });
      if (existing) return existing;
    }

    if (input.journalEntryId) {
      const journalEntry = await prisma.memberHealthJournalEntry.findFirst({
        where: { id: input.journalEntryId, tenantId: input.tenantId, memberId: context.id },
        select: { id: true },
      });
      if (!journalEntry) throw new Error("Choose one of your own health notes.");

      const existing = await prisma.memberHealthShare.findFirst({
        where: {
          tenantId: input.tenantId,
          memberId: context.id,
          preauthId: input.preauthId,
          journalEntryId: input.journalEntryId,
          revokedAt: null,
          OR: activeShareWindow(),
        },
      });
      if (existing) return existing;
    }

    return prisma.memberHealthShare.create({
      data: {
        tenantId: input.tenantId,
        memberId: context.id,
        sharedByUserId: input.userId,
        preauthId: input.preauthId,
        healthFileId: input.healthFileId,
        journalEntryId: input.journalEntryId,
        expiresAt: input.expiresAt,
      },
    });
  }

  static async shareWithProvider(input: {
    userId: string;
    tenantId: string;
    providerId: string;
    healthFileId?: string | null;
    journalEntryId?: string | null;
    expiresAt?: Date | null;
  }) {
    const context = await MemberAppService.resolveMemberContext(input.userId, input.tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");
    if (!input.healthFileId && !input.journalEntryId) throw new Error("Choose a file or note to share.");

    const provider = await prisma.provider.findFirst({
      where: { id: input.providerId, tenantId: input.tenantId, contractStatus: "ACTIVE" },
      select: { id: true },
    });
    if (!provider) throw new Error("Choose an active provider.");

    if (input.healthFileId) {
      const file = await prisma.memberHealthFile.findFirst({
        where: { id: input.healthFileId, tenantId: input.tenantId, memberId: context.id },
        select: { id: true },
      });
      if (!file) throw new Error("Choose one of your own health files.");

      const existing = await prisma.memberHealthShare.findFirst({
        where: {
          tenantId: input.tenantId,
          memberId: context.id,
          providerId: input.providerId,
          healthFileId: input.healthFileId,
          revokedAt: null,
          OR: activeShareWindow(),
        },
      });
      if (existing) return existing;
    }

    if (input.journalEntryId) {
      const journalEntry = await prisma.memberHealthJournalEntry.findFirst({
        where: { id: input.journalEntryId, tenantId: input.tenantId, memberId: context.id },
        select: { id: true },
      });
      if (!journalEntry) throw new Error("Choose one of your own health notes.");

      const existing = await prisma.memberHealthShare.findFirst({
        where: {
          tenantId: input.tenantId,
          memberId: context.id,
          providerId: input.providerId,
          journalEntryId: input.journalEntryId,
          revokedAt: null,
          OR: activeShareWindow(),
        },
      });
      if (existing) return existing;
    }

    return prisma.memberHealthShare.create({
      data: {
        tenantId: input.tenantId,
        memberId: context.id,
        sharedByUserId: input.userId,
        providerId: input.providerId,
        healthFileId: input.healthFileId,
        journalEntryId: input.journalEntryId,
        expiresAt: input.expiresAt,
      },
    });
  }

  static async shareWithCheckIn(input: {
    userId: string;
    tenantId: string;
    checkInChallengeId: string;
    healthFileId?: string | null;
    journalEntryId?: string | null;
    expiresAt?: Date | null;
  }) {
    const context = await MemberAppService.resolveMemberContext(input.userId, input.tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");
    if (!input.healthFileId && !input.journalEntryId) throw new Error("Choose a file or note to share.");

    const challenge = await prisma.checkInChallenge.findFirst({
      where: {
        id: input.checkInChallengeId,
        tenantId: input.tenantId,
        memberId: context.id,
        status: {
          in: [
            CheckInChallengeStatus.PENDING,
            CheckInChallengeStatus.SIGNED,
            CheckInChallengeStatus.FALLBACK_STARTED,
          ],
        },
      },
      select: { id: true },
    });
    if (!challenge) throw new Error("Choose an active check-in request for your own member profile.");

    if (input.healthFileId) {
      const file = await prisma.memberHealthFile.findFirst({
        where: { id: input.healthFileId, tenantId: input.tenantId, memberId: context.id },
        select: { id: true },
      });
      if (!file) throw new Error("Choose one of your own health files.");

      const existing = await prisma.memberHealthShare.findFirst({
        where: {
          tenantId: input.tenantId,
          memberId: context.id,
          checkInChallengeId: input.checkInChallengeId,
          healthFileId: input.healthFileId,
          revokedAt: null,
          OR: activeShareWindow(),
        },
      });
      if (existing) return existing;
    }

    if (input.journalEntryId) {
      const journalEntry = await prisma.memberHealthJournalEntry.findFirst({
        where: { id: input.journalEntryId, tenantId: input.tenantId, memberId: context.id },
        select: { id: true },
      });
      if (!journalEntry) throw new Error("Choose one of your own health notes.");

      const existing = await prisma.memberHealthShare.findFirst({
        where: {
          tenantId: input.tenantId,
          memberId: context.id,
          checkInChallengeId: input.checkInChallengeId,
          journalEntryId: input.journalEntryId,
          revokedAt: null,
          OR: activeShareWindow(),
        },
      });
      if (existing) return existing;
    }

    return prisma.memberHealthShare.create({
      data: {
        tenantId: input.tenantId,
        memberId: context.id,
        sharedByUserId: input.userId,
        checkInChallengeId: input.checkInChallengeId,
        healthFileId: input.healthFileId,
        journalEntryId: input.journalEntryId,
        expiresAt: input.expiresAt ?? addHours(new Date(), 24),
      },
    });
  }

  static async revokeShare(input: {
    userId: string;
    tenantId: string;
    shareId: string;
  }) {
    const context = await MemberAppService.resolveMemberContext(input.userId, input.tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");

    await prisma.memberHealthShare.updateMany({
      where: { id: input.shareId, tenantId: input.tenantId, memberId: context.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
