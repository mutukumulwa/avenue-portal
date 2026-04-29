import { prisma } from "@/lib/prisma";

type CreateNotificationInput = {
  tenantId: string;
  memberId: string;
  challengeId: string;
  credentialId?: string | null;
  title: string;
  body: string;
  expiresAt: Date;
};

export async function createInAppCheckInNotification(input: CreateNotificationInput) {
  return prisma.memberCheckInNotification.create({
    data: {
      tenantId: input.tenantId,
      memberId: input.memberId,
      challengeId: input.challengeId,
      credentialId: input.credentialId ?? undefined,
      title: input.title,
      body: input.body,
      expiresAt: input.expiresAt,
    },
  });
}
