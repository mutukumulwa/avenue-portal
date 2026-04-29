import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture, RegistrationResponseJSON } from "@simplewebauthn/types";
import {
  AuthenticatorAttachment,
  CheckInChallengeStatus,
  CheckInFlow,
  CheckInNotificationStatus,
  CheckInOutcome,
  WebAuthnRegistrationStatus,
  WebAuthnEnrollmentApprovalStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addSeconds, generateVisitCode, randomBase64Url, sha256 } from "./crypto";
import { appendCheckInEvent } from "./audit-chain";

const registrationTtlSeconds = Number(process.env.WEBAUTHN_REGISTRATION_TTL_SECONDS ?? 300);
const enrollmentApprovalTtlMinutes = Number(process.env.WEBAUTHN_BRANCH_APPROVAL_TTL_MINUTES ?? 15);
const visitCodeTtlSeconds = Number(process.env.CHECKIN_VISIT_CODE_TTL_SECONDS ?? 120);
const credentialLockoutMinutes = Number(process.env.WEBAUTHN_FAILED_LOCKOUT_MINUTES ?? 10);

function getRpID() {
  return process.env.WEBAUTHN_RP_ID ?? (process.env.NODE_ENV === "production" ? "" : "localhost");
}

function getOrigin() {
  const configured = process.env.WEBAUTHN_ORIGIN;
  if (configured) return configured.split(",").map((origin) => origin.trim()).filter(Boolean);
  return process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"];
}

function getRpName() {
  return process.env.WEBAUTHN_RP_NAME ?? "Avenue Health";
}

function toBase64Url(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function mapAttachment(value: RegistrationResponseJSON["authenticatorAttachment"]) {
  if (value === "platform") return AuthenticatorAttachment.PLATFORM;
  if (value === "cross-platform") return AuthenticatorAttachment.CROSS_PLATFORM;
  return AuthenticatorAttachment.UNKNOWN;
}

export class WebAuthnEnrollmentService {
  static assertConfigured() {
    const rpID = getRpID();
    const origins = getOrigin();
    if (!rpID || origins.length === 0) {
      throw new Error("WebAuthn RP settings are not configured for this environment.");
    }
    return { rpID, origins, rpName: getRpName() };
  }

  static async createBranchEnrollmentApproval(input: {
    tenantId: string;
    memberId: string;
    approvedById: string;
    reason?: string | null;
  }) {
    const member = await prisma.member.findUnique({
      where: { id: input.memberId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!member) throw new Error("Member not found.");

    await this.expireStaleEnrollmentApprovals(input.tenantId, input.memberId);

    const token = randomBase64Url(32);
    const approval = await prisma.webAuthnEnrollmentApproval.create({
      data: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        approvedById: input.approvedById,
        tokenHash: sha256(token),
        reason: input.reason?.trim() || undefined,
        expiresAt: addSeconds(new Date(), enrollmentApprovalTtlMinutes * 60),
      },
    });

    await appendCheckInEvent({
      tenantId: input.tenantId,
      memberId: input.memberId,
      flow: CheckInFlow.BIOMETRIC,
      outcome: CheckInOutcome.INITIATED,
      overrideById: input.approvedById,
      reasonCode: "BRANCH_WEBAUTHN_ENROLLMENT_APPROVED",
      notes: input.reason?.trim() || undefined,
      reviewRequired: true,
      metadata: { approvalId: approval.id },
    });

    return { approval, token };
  }

  static async beginRegistration(input: { tenantId: string; memberId: string; approvalToken?: string | null }) {
    const { rpID, rpName } = this.assertConfigured();
    const member = await prisma.member.findUnique({
      where: { id: input.memberId, tenantId: input.tenantId },
      select: {
        id: true,
        memberNumber: true,
        firstName: true,
        lastName: true,
        email: true,
        webAuthnCredentials: {
          where: { status: "ACTIVE" },
          select: { credentialId: true, transports: true },
        },
      },
    });

    if (!member) throw new Error("Member not found.");

    await this.expireStaleRegistrationChallenges(input.tenantId, input.memberId);
    await this.assertEnrollmentAllowed(input);

    const challenge = randomBase64Url(32);
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: member.id,
      userName: member.email ?? member.memberNumber,
      userDisplayName: `${member.firstName} ${member.lastName}`.trim(),
      challenge,
      timeout: registrationTtlSeconds * 1000,
      attestationType: "none",
      excludeCredentials: member.webAuthnCredentials.map((credential) => ({
        id: fromBase64Url(credential.credentialId),
        type: "public-key",
        transports: credential.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    await prisma.webAuthnRegistrationChallenge.create({
      data: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        challenge: options.challenge,
        challengeHash: sha256(options.challenge),
        expiresAt: addSeconds(new Date(), registrationTtlSeconds),
      },
    });

    return options;
  }

  static async verifyRegistration(input: {
    tenantId: string;
    memberId: string;
    response: RegistrationResponseJSON;
    deviceName?: string | null;
    approvalToken?: string | null;
  }) {
    const { rpID, origins } = this.assertConfigured();

    const challenge = await prisma.webAuthnRegistrationChallenge.findFirst({
      where: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        status: WebAuthnRegistrationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!challenge) throw new Error("Registration request expired. Start again.");
    const approval = await this.assertEnrollmentAllowed(input);

    const verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      await prisma.webAuthnRegistrationChallenge.update({
        where: { id: challenge.id },
        data: { status: WebAuthnRegistrationStatus.FAILED, consumedAt: new Date() },
      });
      throw new Error("Device registration could not be verified.");
    }

    const info = verification.registrationInfo;
    const credentialId = toBase64Url(info.credentialID);
    const publicKey = toBase64Url(info.credentialPublicKey);

    const credential = await prisma.memberWebAuthnCredential.create({
      data: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        credentialId,
        publicKey,
        counter: info.counter,
        transports: input.response.response.transports ?? [],
        deviceName: input.deviceName?.trim() || "This device",
        attachment: mapAttachment(input.response.authenticatorAttachment),
        isSoftCredential: info.credentialDeviceType === "multiDevice",
      },
    });

    await prisma.webAuthnRegistrationChallenge.update({
      where: { id: challenge.id },
      data: { status: WebAuthnRegistrationStatus.VERIFIED, consumedAt: new Date() },
    });
    if (approval) {
      await prisma.webAuthnEnrollmentApproval.update({
        where: { id: approval.id },
        data: { status: WebAuthnEnrollmentApprovalStatus.USED, usedAt: new Date() },
      });
    }

    await appendCheckInEvent({
      tenantId: input.tenantId,
      memberId: input.memberId,
      credentialId: credential.id,
      flow: CheckInFlow.BIOMETRIC,
      outcome: CheckInOutcome.SUCCESS,
      reviewRequired: false,
      reasonCode: "WEBAUTHN_CREDENTIAL_REGISTERED",
      metadata: {
        credentialDeviceType: info.credentialDeviceType,
        credentialBackedUp: info.credentialBackedUp,
        attachment: input.response.authenticatorAttachment ?? "unknown",
        branchApprovalId: approval?.id ?? null,
      },
    });

    return credential;
  }

  static async expireStaleRegistrationChallenges(tenantId: string, memberId?: string) {
    await prisma.webAuthnRegistrationChallenge.updateMany({
      where: {
        tenantId,
        memberId: memberId ?? undefined,
        status: WebAuthnRegistrationStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: {
        status: WebAuthnRegistrationStatus.EXPIRED,
        consumedAt: new Date(),
      },
    });
  }

  static async expireStaleEnrollmentApprovals(tenantId: string, memberId?: string) {
    await prisma.webAuthnEnrollmentApproval.updateMany({
      where: {
        tenantId,
        memberId: memberId ?? undefined,
        status: WebAuthnEnrollmentApprovalStatus.PENDING,
        expiresAt: { lte: new Date() },
      },
      data: { status: WebAuthnEnrollmentApprovalStatus.EXPIRED },
    });
  }

  private static async assertEnrollmentAllowed(input: {
    tenantId: string;
    memberId: string;
    approvalToken?: string | null;
  }) {
    const activeCredentialCount = await prisma.memberWebAuthnCredential.count({
      where: { tenantId: input.tenantId, memberId: input.memberId, status: "ACTIVE" },
    });

    if (activeCredentialCount > 0 && !input.approvalToken) return null;
    if (!input.approvalToken) {
      throw new Error("Branch approval is required to register the first secure check-in device.");
    }

    await this.expireStaleEnrollmentApprovals(input.tenantId, input.memberId);

    const approval = await prisma.webAuthnEnrollmentApproval.findFirst({
      where: {
        tenantId: input.tenantId,
        memberId: input.memberId,
        tokenHash: sha256(input.approvalToken),
        status: WebAuthnEnrollmentApprovalStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });

    if (!approval) throw new Error("Branch enrollment approval is missing or expired.");
    return approval;
  }
}

export class WebAuthnCheckInService {
  static async generateAssertionOptions(input: {
    tenantId: string;
    memberId: string;
    challengeId: string;
  }) {
    const { rpID } = WebAuthnEnrollmentService.assertConfigured();

    const challenge = await prisma.checkInChallenge.findUnique({
      where: { id: input.challengeId, tenantId: input.tenantId },
      include: {
        member: {
          select: {
            id: true,
            webAuthnCredentials: {
              where: { status: "ACTIVE" },
              select: { credentialId: true, transports: true },
            },
          },
        },
      },
    });

    if (!challenge || challenge.memberId !== input.memberId) throw new Error("Check-in request not found.");
    if (challenge.status !== CheckInChallengeStatus.PENDING) throw new Error("Check-in request is no longer pending.");
    if (challenge.expiresAt <= new Date()) throw new Error("Check-in request expired. Please ask reception to restart.");
    if (challenge.member.webAuthnCredentials.length === 0) {
      throw new Error("No registered biometric device is available for this member.");
    }

    return generateAuthenticationOptions({
      rpID,
      challenge: challenge.challenge,
      timeout: 90_000,
      userVerification: "required",
      allowCredentials: challenge.member.webAuthnCredentials.map((credential) => ({
        id: fromBase64Url(credential.credentialId),
        type: "public-key",
        transports: credential.transports as AuthenticatorTransportFuture[],
      })),
    });
  }

  static async verifyAssertion(input: {
    tenantId: string;
    memberId: string;
    challengeId: string;
    response: AuthenticationResponseJSON;
  }) {
    const { rpID, origins } = WebAuthnEnrollmentService.assertConfigured();

    const challenge = await prisma.checkInChallenge.findUnique({
      where: { id: input.challengeId, tenantId: input.tenantId },
      include: { provider: { select: { name: true } } },
    });

    if (!challenge || challenge.memberId !== input.memberId) throw new Error("Check-in request not found.");
    if (challenge.status !== CheckInChallengeStatus.PENDING) throw new Error("Check-in request is no longer pending.");
    if (challenge.expiresAt <= new Date()) throw new Error("Check-in request expired. Please ask reception to restart.");

    const credential = await prisma.memberWebAuthnCredential.findUnique({
      where: { credentialId: input.response.id },
    });

    if (!credential || credential.tenantId !== input.tenantId || credential.memberId !== input.memberId) {
      throw new Error("This device is not registered for the member.");
    }
    if (credential.status !== "ACTIVE") {
      throw new Error("This device is not active for secure check-in.");
    }
    if (credential.lockedUntil && credential.lockedUntil > new Date()) {
      throw new Error("This device is temporarily locked for secure check-in.");
    }

    const verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
      authenticator: {
        credentialID: fromBase64Url(credential.credentialId),
        credentialPublicKey: fromBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransportFuture[],
      },
    });

    if (!verification.verified) {
      const nextAttemptCount = challenge.attemptCount + 1;
      const shouldLock = nextAttemptCount >= 3;
      await prisma.checkInChallenge.update({
        where: { id: challenge.id },
        data: {
          attemptCount: { increment: 1 },
          status: shouldLock ? CheckInChallengeStatus.FALLBACK_STARTED : undefined,
        },
      });
      if (shouldLock) {
        await prisma.memberWebAuthnCredential.update({
          where: { id: credential.id },
          data: { lockedUntil: addSeconds(new Date(), credentialLockoutMinutes * 60) },
        });
      }
      await appendCheckInEvent({
        tenantId: input.tenantId,
        memberId: input.memberId,
        providerId: challenge.providerId,
        challengeId: challenge.id,
        credentialId: credential.id,
        flow: CheckInFlow.BIOMETRIC,
        outcome: CheckInOutcome.FAILED,
        initiatedById: challenge.initiatedById,
        reasonCode: "WEBAUTHN_ASSERTION_FAILED",
        reviewRequired: true,
      });
      throw new Error(shouldLock ? "Biometric verification failed three times. Use fallback or restart later." : "Biometric verification failed.");
    }

    const visitCode = generateVisitCode();
    const visitCodeExpiresAt = addSeconds(new Date(), visitCodeTtlSeconds);

    await prisma.$transaction([
      prisma.memberWebAuthnCredential.update({
        where: { id: credential.id },
        data: {
          counter: verification.authenticationInfo.newCounter,
          lastUsedAt: new Date(),
        },
      }),
      prisma.checkInChallenge.update({
        where: { id: challenge.id },
        data: {
          status: CheckInChallengeStatus.SIGNED,
          signedCredentialId: credential.id,
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
      credentialId: credential.id,
      flow: CheckInFlow.BIOMETRIC,
      outcome: CheckInOutcome.SUCCESS,
      initiatedById: challenge.initiatedById,
      reviewRequired: false,
      metadata: {
        providerName: challenge.provider.name,
        credentialDeviceType: verification.authenticationInfo.credentialDeviceType,
        credentialBackedUp: verification.authenticationInfo.credentialBackedUp,
      },
    });

    return {
      visitCode,
      providerName: challenge.provider.name,
      expiresAt: visitCodeExpiresAt,
    };
  }
}
