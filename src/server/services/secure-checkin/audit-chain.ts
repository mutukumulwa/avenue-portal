import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sha256 } from "./crypto";

type AppendCheckInEventInput = {
  tenantId: string;
  memberId: string;
  providerId?: string | null;
  challengeId?: string | null;
  flow: Prisma.CheckInEventCreateInput["flow"];
  outcome: Prisma.CheckInEventCreateInput["outcome"];
  initiatedById?: string | null;
  overrideById?: string | null;
  credentialId?: string | null;
  photoEvidenceUrl?: string | null;
  knowledgeQuestionKeys?: string[];
  geoLatitude?: Prisma.Decimal | null;
  geoLongitude?: Prisma.Decimal | null;
  reviewRequired?: boolean;
  reasonCode?: string | null;
  notes?: string | null;
  metadata?: Prisma.InputJsonValue;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export async function appendCheckInEvent(input: AppendCheckInEventInput) {
  const previous = await prisma.checkInEvent.findFirst({
    where: { tenantId: input.tenantId, memberId: input.memberId },
    orderBy: { createdAt: "desc" },
    select: { eventHash: true },
  });

  const createdAt = new Date();
  const previousEventHash = previous?.eventHash ?? null;
  const notesHash = input.notes ? sha256(input.notes) : null;

  const eventHash = sha256(
    stableStringify({
      tenantId: input.tenantId,
      memberId: input.memberId,
      providerId: input.providerId ?? null,
      challengeId: input.challengeId ?? null,
      flow: input.flow,
      outcome: input.outcome,
      initiatedById: input.initiatedById ?? null,
      overrideById: input.overrideById ?? null,
      credentialId: input.credentialId ?? null,
      photoEvidenceUrl: input.photoEvidenceUrl ?? null,
      knowledgeQuestionKeys: input.knowledgeQuestionKeys ?? [],
      geoLatitude: input.geoLatitude ? input.geoLatitude.toString() : null,
      geoLongitude: input.geoLongitude ? input.geoLongitude.toString() : null,
      reviewRequired: input.reviewRequired ?? false,
      reasonCode: input.reasonCode ?? null,
      notesHash,
      previousEventHash,
      metadata: input.metadata ?? null,
      createdAt: createdAt.toISOString(),
    })
  );

  return prisma.checkInEvent.create({
    data: {
      tenantId: input.tenantId,
      memberId: input.memberId,
      providerId: input.providerId ?? undefined,
      challengeId: input.challengeId ?? undefined,
      flow: input.flow,
      outcome: input.outcome,
      initiatedById: input.initiatedById ?? undefined,
      overrideById: input.overrideById ?? undefined,
      credentialId: input.credentialId ?? undefined,
      photoEvidenceUrl: input.photoEvidenceUrl ?? undefined,
      knowledgeQuestionKeys: input.knowledgeQuestionKeys ?? [],
      geoLatitude: input.geoLatitude ?? undefined,
      geoLongitude: input.geoLongitude ?? undefined,
      reviewRequired: input.reviewRequired ?? false,
      reasonCode: input.reasonCode ?? undefined,
      notesHash: notesHash ?? undefined,
      previousEventHash: previousEventHash ?? undefined,
      eventHash,
      metadata: input.metadata ?? undefined,
      createdAt,
    },
  });
}
