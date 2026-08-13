import { prisma } from "@/lib/prisma";
import {
  MEMBER_ACTION_LABELS,
  canPerformMemberAction,
  type ActionVerdict,
  type MemberAction,
} from "@/lib/member-action-policy";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient | Prisma.TransactionClient, "member">;

/**
 * UAT-HF P07.06 — server-side half of the member action policy.
 *
 * A disabled link is not an integrity boundary: every Server Action is a public
 * POST endpoint and its member id is untrusted input. Resolve the current row in
 * the actor's tenant (and, for an endorsement, the selected group) immediately
 * before the mutation and apply the same policy the profile renders.
 */
export const MemberActionGuardService = {
  async evaluate(
    input: {
      tenantId: string;
      memberId: string;
      action: MemberAction;
      groupId?: string;
    },
    db: Db = prisma,
  ): Promise<ActionVerdict> {
    const memberId = input.memberId.trim();
    if (!memberId) return unavailable(input.action);

    const member = await db.member.findFirst({
      where: {
        id: memberId,
        tenantId: input.tenantId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
      },
      select: { status: true },
    });

    // Cross-tenant, cross-group and nonexistent ids deliberately have one safe
    // shape. The action must not become a member-enumeration endpoint.
    if (!member) return unavailable(input.action);
    return canPerformMemberAction(member.status, input.action);
  },
};

export function memberActionRefusal(verdict: ActionVerdict): string {
  return [verdict.reason, verdict.nextAction].filter(Boolean).join(" ");
}

function unavailable(action: MemberAction): ActionVerdict {
  return {
    allowed: false,
    reason: `${MEMBER_ACTION_LABELS[action]} is not available for this member.`,
    nextAction: "Return to member search and select a member in your organisation.",
  };
}
