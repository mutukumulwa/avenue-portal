import { CheckInChallengeStatus, CheckInFlow, CheckInNotificationStatus, CheckInOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addSeconds, generateVisitCode, hashesMatch, randomBase64Url, sha256 } from "./crypto";
import { appendCheckInEvent } from "./audit-chain";
import { createInAppCheckInNotification } from "./adapters/notification";
import { verifyKnowledgeAnswers } from "./knowledge";

const challengeTtlSeconds = Number(process.env.CHECKIN_CHALLENGE_TTL_SECONDS ?? 90);
const visitCodeTtlSeconds = Number(process.env.CHECKIN_VISIT_CODE_TTL_SECONDS ?? 120);
const activeStatuses = [
  CheckInChallengeStatus.PENDING,
  CheckInChallengeStatus.SIGNED,
  CheckInChallengeStatus.FALLBACK_STARTED,
];

export class SecureCheckInService {
  static async initiateChallenge(input: {
    tenantId: string;
    memberId: string;
    providerId: string;
    initiatedById: string;
    workstationId?: string | null;
  }) {
    const [member, provider] = await Promise.all([
      prisma.member.findUnique({
        where: { id: input.memberId, tenantId: input.tenantId },
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.provider.findUnique({
        where: { id: input.providerId, tenantId: input.tenantId },
        select: { id: true, name: true },
      }),
    ]);

    if (!member) throw new Error("Member not found.");
    if (!provider) throw new Error("Facility not found.");

    await this.expireStaleChallenges(input.tenantId);

    const existing = await prisma.checkInChallenge.findFirst({
      where: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        providerId: input.providerId,
        status: { in: activeStatuses },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) return existing;

    const challenge = randomBase64Url(32);
    const expiresAt = addSeconds(new Date(), challengeTtlSeconds);

    const record = await prisma.checkInChallenge.create({
      data: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        providerId: input.providerId,
        initiatedById: input.initiatedById,
        workstationId: input.workstationId ?? undefined,
        challenge,
        challengeHash: sha256(challenge),
        expiresAt,
      },
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
      },
    });

    await createInAppCheckInNotification({
      tenantId: input.tenantId,
      memberId: input.memberId,
      challengeId: record.id,
      title: "Secure check-in requested",
      body: `Reception at ${provider.name} is requesting member check-in verification.`,
      expiresAt,
    });

    await appendCheckInEvent({
      tenantId: input.tenantId,
      memberId: input.memberId,
      providerId: input.providerId,
      challengeId: record.id,
      flow: CheckInFlow.IN_APP_CONFIRMATION,
      outcome: CheckInOutcome.INITIATED,
      initiatedById: input.initiatedById,
      metadata: { status: "challenge_created", providerName: provider.name },
    });

    return record;
  }

  static async getChallengeForStaff(tenantId: string, challengeId: string) {
    await this.expireStaleChallenges(tenantId);

    return prisma.checkInChallenge.findUnique({
      where: { id: challengeId, tenantId },
      include: {
        member: {
          select: {
            id: true,
            memberNumber: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            email: true,
            phone: true,
            group: { select: { name: true } },
            dependents: { select: { firstName: true, lastName: true }, take: 5 },
            claims: {
              orderBy: { dateOfService: "desc" },
              take: 1,
              select: { dateOfService: true, provider: { select: { name: true } } },
            },
            visitVerifications: {
              orderBy: { openedAt: "desc" },
              take: 1,
              select: { openedAt: true, provider: { select: { name: true } } },
            },
          },
        },
        provider: { select: { id: true, name: true, tier: true } },
        initiatedBy: { select: { firstName: true, lastName: true, email: true } },
        visitVerification: true,
        events: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
  }

  static async getPendingForMember(tenantId: string, memberId: string) {
    await this.expireStaleChallenges(tenantId);

    return prisma.memberCheckInNotification.findMany({
      where: {
        tenantId,
        memberId,
        status: CheckInNotificationStatus.PENDING,
        expiresAt: { gt: new Date() },
        challenge: { status: CheckInChallengeStatus.PENDING },
      },
      include: {
        challenge: {
          include: {
            provider: { select: { name: true, county: true } },
            initiatedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private static calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const p = 0.017453292519943295; // Math.PI / 180
    const c = Math.cos;
    const a = 0.5 - c((lat2 - lat1) * p) / 2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p)) / 2;
    return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
  }

  static async acknowledgeInAppChallenge(input: {
    tenantId: string;
    memberId: string;
    challengeId: string;
    latitude?: number;
    longitude?: number;
  }) {
    const challenge = await prisma.checkInChallenge.findUnique({
      where: { id: input.challengeId, tenantId: input.tenantId },
      include: { provider: { select: { name: true, geoLatitude: true, geoLongitude: true } } },
    });

    if (!challenge || challenge.memberId !== input.memberId) throw new Error("Check-in request not found.");
    if (challenge.status !== CheckInChallengeStatus.PENDING) throw new Error("Check-in request is no longer pending.");
    if (challenge.expiresAt <= new Date()) {
      await this.markExpired(challenge.id, challenge.tenantId, challenge.memberId, challenge.providerId);
      throw new Error("Check-in request expired. Please ask reception to restart.");
    }

    let isFlagged = false;
    let distanceKm: number | undefined;

    if (input.latitude && input.longitude && challenge.provider.geoLatitude && challenge.provider.geoLongitude) {
      distanceKm = calculateDistanceKm(
        input.latitude,
        input.longitude,
        Number(challenge.provider.geoLatitude),
        Number(challenge.provider.geoLongitude)
      );
      if (distanceKm > 0.5) { // 500 meters
        isFlagged = true;
      }
    }

    const visitCode = generateVisitCode();
    const visitCodeExpiresAt = addSeconds(new Date(), visitCodeTtlSeconds);

    await prisma.$transaction([
      prisma.checkInChallenge.update({
        where: { id: challenge.id },
        data: {
          status: CheckInChallengeStatus.SIGNED,
          visitCodeHash: sha256(visitCode),
          visitCodeExpiresAt,
        },
      }),
      prisma.memberCheckInNotification.updateMany({
        where: { challengeId: challenge.id, memberId: input.memberId },
        data: {
          status: CheckInNotificationStatus.ACTIONED,
          actionedAt: new Date(),
        },
      }),
    ]);

    await appendCheckInEvent({
      tenantId: input.tenantId,
      memberId: input.memberId,
      providerId: challenge.providerId,
      challengeId: challenge.id,
      flow: CheckInFlow.IN_APP_CONFIRMATION,
      outcome: isFlagged ? CheckInOutcome.FLAGGED_FOR_REVIEW : CheckInOutcome.INITIATED,
      initiatedById: challenge.initiatedById,
      reviewRequired: true,
      geoLatitude: input.latitude ? new (require('decimal.js').Decimal)(input.latitude) : undefined,
      geoLongitude: input.longitude ? new (require('decimal.js').Decimal)(input.longitude) : undefined,
      reasonCode: isFlagged ? "GEOFENCE_FAILED" : undefined,
      metadata: { status: "member_confirmed_presence", providerName: challenge.provider.name, distanceKm },
    });

    return {
      visitCode,
      providerName: challenge.provider.name,
      expiresAt: visitCodeExpiresAt,
    };
  }

  static async confirmVisitCode(input: {
    tenantId: string;
    challengeId: string;
    confirmedById: string;
    code: string;
  }) {
    const challenge = await prisma.checkInChallenge.findUnique({
      where: { id: input.challengeId, tenantId: input.tenantId },
    });

    if (!challenge) throw new Error("Check-in request not found.");
    if (challenge.status !== CheckInChallengeStatus.SIGNED || !challenge.visitCodeHash) {
      throw new Error("The member has not confirmed this check-in yet.");
    }
    if (!challenge.visitCodeExpiresAt || challenge.visitCodeExpiresAt <= new Date()) {
      throw new Error("Visit code expired. Restart check-in.");
    }
    if (!hashesMatch(input.code.trim(), challenge.visitCodeHash)) {
      const nextAttemptCount = challenge.attemptCount + 1;
      const shouldFail = nextAttemptCount >= 3;
      await prisma.checkInChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptCount: { increment: 1 },
          status: shouldFail ? CheckInChallengeStatus.FAILED : undefined,
        },
      });
      await appendCheckInEvent({
        tenantId: input.tenantId,
        memberId: challenge.memberId,
        providerId: challenge.providerId,
        challengeId: challenge.id,
        flow: CheckInFlow.IN_APP_CONFIRMATION,
        outcome: CheckInOutcome.FAILED,
        initiatedById: challenge.initiatedById,
        reasonCode: "VISIT_CODE_MISMATCH",
        reviewRequired: true,
      });
      throw new Error(shouldFail ? "Visit code failed three times. Restart check-in or use fallback." : "Visit code does not match.");
    }

    const visit = await prisma.visitVerification.create({
      data: {
        tenantId: input.tenantId,
        memberId: challenge.memberId,
        providerId: challenge.providerId,
        challengeId: challenge.id,
        flow: CheckInFlow.IN_APP_CONFIRMATION,
        confirmedById: input.confirmedById,
        reviewRequired: true,
      },
    });

    await prisma.checkInChallenge.update({
      where: { id: challenge.id },
      data: {
        status: CheckInChallengeStatus.CODE_CONFIRMED,
        consumedAt: new Date(),
      },
    });

    await appendCheckInEvent({
      tenantId: input.tenantId,
      memberId: challenge.memberId,
      providerId: challenge.providerId,
      challengeId: challenge.id,
      flow: CheckInFlow.IN_APP_CONFIRMATION,
      outcome: CheckInOutcome.SUCCESS,
      initiatedById: challenge.initiatedById,
      reviewRequired: true,
      metadata: { visitVerificationId: visit.id },
    });

    return visit;
  }

  static async cancelChallenge(input: {
    tenantId: string;
    challengeId: string;
    cancelledById: string;
    reason?: string | null;
  }) {
    const challenge = await prisma.checkInChallenge.findUnique({
      where: { id: input.challengeId, tenantId: input.tenantId },
    });

    if (!challenge) throw new Error("Check-in request not found.");
    if (challenge.status === CheckInChallengeStatus.CODE_CONFIRMED) throw new Error("Cannot cancel an opened visit.");

    await prisma.$transaction([
      prisma.checkInChallenge.update({
        where: { id: challenge.id },
        data: {
          status: CheckInChallengeStatus.CANCELLED,
          consumedAt: new Date(),
        },
      }),
      prisma.memberCheckInNotification.updateMany({
        where: { challengeId: challenge.id },
        data: { status: CheckInNotificationStatus.CANCELLED },
      }),
    ]);

    await appendCheckInEvent({
      tenantId: input.tenantId,
      memberId: challenge.memberId,
      providerId: challenge.providerId,
      challengeId: challenge.id,
      flow: CheckInFlow.IN_APP_CONFIRMATION,
      outcome: CheckInOutcome.FAILED,
      initiatedById: challenge.initiatedById,
      overrideById: input.cancelledById,
      reasonCode: "CHECKIN_CANCELLED",
      notes: input.reason?.trim() || undefined,
      reviewRequired: false,
    });

    return challenge;
  }

  static async restartChallenge(input: {
    tenantId: string;
    challengeId: string;
    initiatedById: string;
  }) {
    const previous = await prisma.checkInChallenge.findUnique({
      where: { id: input.challengeId, tenantId: input.tenantId },
    });

    if (!previous) throw new Error("Check-in request not found.");
    if (previous.status === CheckInChallengeStatus.CODE_CONFIRMED) throw new Error("Cannot restart an opened visit.");

    await this.cancelChallenge({
      tenantId: input.tenantId,
      challengeId: previous.id,
      cancelledById: input.initiatedById,
      reason: "Restarted by reception.",
    });

    return this.initiateChallenge({
      tenantId: input.tenantId,
      memberId: previous.memberId,
      providerId: previous.providerId,
      initiatedById: input.initiatedById,
      workstationId: previous.workstationId,
    });
  }

  static async emergencyOverride(input: {
    tenantId: string;
    memberId: string;
    providerId: string;
    overrideById: string;
    reason: string;
  }) {
    if (input.reason.trim().length < 10) throw new Error("Override reason must be at least 10 characters.");

    const [member, provider] = await Promise.all([
      prisma.member.findUnique({ where: { id: input.memberId, tenantId: input.tenantId }, select: { id: true } }),
      prisma.provider.findUnique({ where: { id: input.providerId, tenantId: input.tenantId }, select: { id: true } }),
    ]);
    if (!member) throw new Error("Member not found.");
    if (!provider) throw new Error("Facility not found.");

    const visit = await prisma.visitVerification.create({
      data: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        providerId: input.providerId,
        flow: CheckInFlow.EMERGENCY_OVERRIDE,
        confirmedById: input.overrideById,
        overrideReason: input.reason.trim(),
        reviewRequired: true,
      },
    });

    await appendCheckInEvent({
      tenantId: input.tenantId,
      memberId: input.memberId,
      providerId: input.providerId,
      flow: CheckInFlow.EMERGENCY_OVERRIDE,
      outcome: CheckInOutcome.OVERRIDDEN,
      overrideById: input.overrideById,
      reasonCode: "EMERGENCY_OVERRIDE",
      notes: input.reason.trim(),
      reviewRequired: true,
      metadata: { visitVerificationId: visit.id },
    });

    return visit;
  }

  static async completeKnowledgeFallback(input: {
    tenantId: string;
    challengeId: string;
    confirmedById: string;
    photoEvidenceUrl?: string | null;
    answers: Array<{ key: string; answer: string }>;
  }) {
    const challenge = await prisma.checkInChallenge.findUnique({
      where: { id: input.challengeId, tenantId: input.tenantId },
      include: {
        member: {
          include: {
            group: { select: { name: true } },
            dependents: { select: { firstName: true, lastName: true }, take: 5 },
            claims: {
              orderBy: { dateOfService: "desc" },
              take: 1,
              select: { dateOfService: true, provider: { select: { name: true } } },
            },
            visitVerifications: {
              orderBy: { openedAt: "desc" },
              take: 1,
              select: { openedAt: true, provider: { select: { name: true } } },
            },
          },
        },
        provider: { select: { name: true } },
      },
    });

    if (!challenge) throw new Error("Check-in request not found.");
    if (challenge.status === CheckInChallengeStatus.CODE_CONFIRMED) throw new Error("Visit is already open.");
    if (challenge.status === CheckInChallengeStatus.EXPIRED) throw new Error("Check-in request expired. Restart check-in.");

    const verification = verifyKnowledgeAnswers(challenge.member, input.answers);
    const questionKeys = input.answers.map((answer) => answer.key);

    if (!verification.passed) {
      await prisma.checkInChallenge.update({
        where: { id: challenge.id },
        data: { attemptCount: { increment: 1 }, status: CheckInChallengeStatus.FALLBACK_STARTED },
      });
      await appendCheckInEvent({
        tenantId: input.tenantId,
        memberId: challenge.memberId,
        providerId: challenge.providerId,
        challengeId: challenge.id,
        flow: CheckInFlow.PHOTO_KNOWLEDGE,
        outcome: CheckInOutcome.FAILED,
        initiatedById: challenge.initiatedById,
        photoEvidenceUrl: input.photoEvidenceUrl ?? undefined,
        knowledgeQuestionKeys: questionKeys,
        reasonCode: "KNOWLEDGE_CHECK_FAILED",
        reviewRequired: true,
        metadata: { results: verification.results },
      });
      throw new Error("Knowledge verification failed. Use emergency override only if clinically necessary.");
    }

    const visit = await prisma.visitVerification.create({
      data: {
        tenantId: input.tenantId,
        memberId: challenge.memberId,
        providerId: challenge.providerId,
        challengeId: challenge.id,
        flow: CheckInFlow.PHOTO_KNOWLEDGE,
        confirmedById: input.confirmedById,
        reviewRequired: true,
        notes: input.photoEvidenceUrl ? "Photo evidence captured for knowledge fallback." : "Knowledge fallback completed without photo URL.",
      },
    });

    await prisma.checkInChallenge.update({
      where: { id: challenge.id },
      data: {
        status: CheckInChallengeStatus.CODE_CONFIRMED,
        consumedAt: new Date(),
      },
    });

    await appendCheckInEvent({
      tenantId: input.tenantId,
      memberId: challenge.memberId,
      providerId: challenge.providerId,
      challengeId: challenge.id,
      flow: CheckInFlow.PHOTO_KNOWLEDGE,
      outcome: CheckInOutcome.SUCCESS,
      initiatedById: challenge.initiatedById,
      photoEvidenceUrl: input.photoEvidenceUrl ?? undefined,
      knowledgeQuestionKeys: questionKeys,
      reviewRequired: true,
      reasonCode: "KNOWLEDGE_FALLBACK_COMPLETED",
      metadata: { visitVerificationId: visit.id, providerName: challenge.provider.name },
    });

    return visit;
  }

  static async getDailyOverrideSummary(tenantId: string, date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return prisma.checkInEvent.findMany({
      where: {
        tenantId,
        flow: CheckInFlow.EMERGENCY_OVERRIDE,
        createdAt: { gte: start, lt: end },
      },
      include: {
        member: { select: { memberNumber: true, firstName: true, lastName: true } },
        provider: { select: { name: true } },
        overrideBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async expireStaleChallenges(tenantId: string) {
    const stale = await prisma.checkInChallenge.findMany({
      where: {
        tenantId,
        status: { in: [CheckInChallengeStatus.PENDING, CheckInChallengeStatus.SIGNED] },
        expiresAt: { lte: new Date() },
      },
      select: { id: true, memberId: true, providerId: true, initiatedById: true },
    });

    if (stale.length === 0) return;

    await prisma.checkInChallenge.updateMany({
      where: { id: { in: stale.map((c) => c.id) } },
      data: { status: CheckInChallengeStatus.EXPIRED, consumedAt: new Date() },
    });

    await prisma.memberCheckInNotification.updateMany({
      where: { challengeId: { in: stale.map((c) => c.id) } },
      data: { status: CheckInNotificationStatus.EXPIRED },
    });

    await Promise.all(
      stale.map((challenge) =>
        appendCheckInEvent({
          tenantId,
          memberId: challenge.memberId,
          providerId: challenge.providerId,
          challengeId: challenge.id,
          flow: CheckInFlow.IN_APP_CONFIRMATION,
          outcome: CheckInOutcome.EXPIRED,
          initiatedById: challenge.initiatedById,
          reasonCode: "CHALLENGE_TTL_EXPIRED",
          reviewRequired: true,
        })
      )
    );
  }

  private static async markExpired(challengeId: string, tenantId: string, memberId: string, providerId: string) {
    await prisma.checkInChallenge.update({
      where: { id: challengeId },
      data: { status: CheckInChallengeStatus.EXPIRED, consumedAt: new Date() },
    });
    await appendCheckInEvent({
      tenantId,
      memberId,
      providerId,
      challengeId,
      flow: CheckInFlow.IN_APP_CONFIRMATION,
      outcome: CheckInOutcome.EXPIRED,
      reasonCode: "CHALLENGE_TTL_EXPIRED",
      reviewRequired: true,
    });
  }
}
