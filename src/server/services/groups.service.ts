import { prisma } from "@/lib/prisma";
import type { GroupStatus, MemberStatus, PaymentFrequency, Prisma } from "@prisma/client";
import { normalizeLegalName } from "@/lib/normalize";
import { coverageService } from "./coverage.service";
import { resolveSchemeClientId } from "./clientResolve";

/**
 * WP-S2 — explicit scheme lifecycle transition table (decision D9).
 *
 *   PROSPECT → PENDING → ACTIVE → { SUSPENDED ↔ ACTIVE, LAPSED, TERMINATED }
 *
 * LAPSED and TERMINATED are TERMINAL: no normal transition leaves them. A
 * governed reinstate/override (reason + audit) is the only way back to ACTIVE —
 * never the general edit form. `assertTransition` is the single gate every
 * status write goes through, so a free `<select>` can no longer walk the scheme
 * into an invalid state (S-006).
 */
export const GROUP_STATUS_TRANSITIONS: Record<GroupStatus, GroupStatus[]> = {
  PROSPECT: ["PENDING", "TERMINATED"],
  PENDING: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["SUSPENDED", "LAPSED", "TERMINATED"],
  SUSPENDED: ["ACTIVE", "LAPSED", "TERMINATED"],
  LAPSED: [],
  TERMINATED: [],
};

/** Terminal states — reachable only forward, exited only by a governed override. */
export const GROUP_TERMINAL_STATUSES: GroupStatus[] = ["LAPSED", "TERMINATED"];

/** Targets that end or hold cover / reinstate a terminal scheme — a reason is
 *  mandatory (governance + auditability). */
const REASON_REQUIRED_TARGETS: GroupStatus[] = ["SUSPENDED", "LAPSED", "TERMINATED"];

/** Statuses whose members are considered "on cover" and so must be swept when the
 *  scheme leaves ACTIVE (suspend/lapse/terminate). */
const MEMBER_ON_COVER: string[] = ["ACTIVE", "SUSPENDED"];

export type GroupStatusSnapshot = {
  status: GroupStatus;
  suspendedAt: string | null;
  suspensionReason: string | null;
  terminatedAt: string | null;
};

export type GroupProfileSnapshot = {
  name: string;
  industry: string | null;
  registrationNumber: string | null;
  address: string | null;
  county: string | null;
  contactPersonName: string;
  contactPersonPhone: string;
  contactPersonEmail: string;
  paymentFrequency: PaymentFrequency;
  effectiveDate: string;
  renewalDate: string;
  notes: string | null;
};

/** Thrown when a rename/create collides with an existing scheme name in the same
 *  client. Carries `code` so the action can render it as a field error on `name`
 *  (and the DB `@@unique([clientId, nameNormalized])` is the concurrency backstop). */
export class DuplicateSchemeNameError extends Error {
  code = "DUP_SCHEME_NAME" as const;
}

/** Thrown for an invalid lifecycle transition (S-006). */
export class InvalidGroupTransitionError extends Error {
  code = "INVALID_GROUP_TRANSITION" as const;
}

function cleanName(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export class GroupsService {
  /**
   * Client-isolation filter (G2.1). When `clientId` is provided the caller is
   * confined to that client; when omitted the caller is operator-level and
   * spans every client in the tenant.
   */
  private static clientWhere(clientId?: string) {
    return clientId ? { clientId } : {};
  }

  /**
   * Retrieves all groups for a given tenant (and client, when confined).
   */
  static async getGroups(tenantId: string, clientId?: string) {
    return prisma.group.findMany({
      where: { tenantId, ...this.clientWhere(clientId) },
      include: {
        package: true,
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Retrieves a specific group by ID, scoped to tenant (and client, when confined).
   */
  static async getGroupById(tenantId: string, groupId: string, clientId?: string) {
    return prisma.group.findFirst({
      where: { id: groupId, tenantId, ...this.clientWhere(clientId) },
      include: {
        package: true,
      },
    });
  }

  /**
   * Enrolls a new Corporate Group and attaches a package.
   *
   * WP-S1: the duplicate-name check is now CLIENT-scoped (two different clients
   * may each run a "Staff Medical Scheme"; one client may not) and case/space
   * insensitive; `nameNormalized` is written so the deploy-gated
   * `@@unique([clientId, nameNormalized])` becomes the concurrency backstop. The
   * effective date is validated to a real Date so an Invalid Date can never reach
   * Prisma. The scheme is pinned to the package's current version (F-PIN-2).
   */
  static async createGroup(tenantId: string, data: {
    name: string;
    industry?: string;
    registrationNumber?: string;
    contactPersonName: string;
    contactPersonPhone: string;
    contactPersonEmail: string;
    packageId: string;
    effectiveDate: string | Date;
  }, clientId?: string) {
    const pkg = await prisma.package.findUnique({
      where: { id: data.packageId, tenantId },
      include: { currentVersion: true },
    });

    if (!pkg) throw new Error("Target package does not exist for this tenant.");

    const name = cleanName(data.name);
    if (!name) throw new Error("Scheme name is required.");

    const effectiveDateObj = new Date(data.effectiveDate);
    if (Number.isNaN(effectiveDateObj.getTime())) {
      throw new Error("Effective date is invalid.");
    }
    const renewalDate = new Date(effectiveDateObj);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);

    const resolvedClientId = await resolveSchemeClientId(tenantId, clientId);

    // CLIENT-scoped duplicate rule (not tenant-scoped). Case/space insensitive via
    // the collapsed name; the DB unique on nameNormalized is the race backstop.
    const existing = await prisma.group.findFirst({
      where: {
        clientId: resolvedClientId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existing) {
      throw new DuplicateSchemeNameError(
        `A scheme named "${name}" already exists for this client.`,
      );
    }

    return prisma.group.create({
      data: {
        tenantId,
        clientId: resolvedClientId,
        name,
        nameNormalized: normalizeLegalName(name),
        industry: data.industry,
        registrationNumber: data.registrationNumber,
        contactPersonName: data.contactPersonName,
        contactPersonPhone: data.contactPersonPhone,
        contactPersonEmail: data.contactPersonEmail,
        packageId: pkg.id,
        packageVersionId: pkg.currentVersionId,
        contributionRate: pkg.contributionAmount,
        effectiveDate: effectiveDateObj,
        renewalDate: renewalDate,
        status: "ACTIVE",
      },
    });
  }

  /**
   * Updates editable PROFILE fields on an existing group (WP-S1).
   *
   * Status is deliberately NOT editable here — lifecycle transitions are governed
   * (`changeGroupStatus`), so a profile edit has ZERO eligibility impact (S-012).
   * A rename re-checks the client-scoped duplicate rule (previously never
   * re-checked), and `effectiveDate < renewalDate` is enforced as a last line of
   * defence even if a caller bypassed the schema. Returns before/after snapshots
   * so the caller can write a before→after audit event (the edit emitted none).
   */
  static async updateGroup(tenantId: string, groupId: string, data: {
    name: string;
    industry?: string;
    registrationNumber?: string;
    address?: string;
    county?: string;
    contactPersonName: string;
    contactPersonPhone: string;
    contactPersonEmail: string;
    paymentFrequency: PaymentFrequency;
    effectiveDate: string | Date;
    renewalDate: string | Date;
    notes?: string;
  }, clientId?: string): Promise<{ before: GroupProfileSnapshot; after: GroupProfileSnapshot; groupName: string }> {
    // Scope the lookup to the caller's client when confined (G2.1) so a confined
    // user cannot reach another client's scheme within the same tenant.
    const group = await prisma.group.findFirst({
      where: { id: groupId, tenantId, ...this.clientWhere(clientId) },
    });
    if (!group) throw new Error("Group not found");

    const name = cleanName(data.name);
    if (!name) throw new Error("Scheme name is required.");

    const effectiveDateObj = new Date(data.effectiveDate);
    const renewalDateObj = new Date(data.renewalDate);
    if (Number.isNaN(effectiveDateObj.getTime()) || Number.isNaN(renewalDateObj.getTime())) {
      throw new Error("Effective and renewal dates must both be valid dates.");
    }
    if (!(effectiveDateObj < renewalDateObj)) {
      throw new Error("Renewal date must be after the effective date.");
    }

    // Re-check the client-scoped duplicate rule on rename, excluding self.
    if (normalizeLegalName(name) !== normalizeLegalName(group.name)) {
      const clash = await prisma.group.findFirst({
        where: {
          clientId: group.clientId,
          id: { not: groupId },
          name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (clash) {
        throw new DuplicateSchemeNameError(
          `A scheme named "${name}" already exists for this client.`,
        );
      }
    }

    const before = this.profileSnapshot(group);

    const updated = await prisma.group.update({
      where: { id: groupId },
      data: {
        name,
        nameNormalized: normalizeLegalName(name),
        industry: data.industry || null,
        registrationNumber: data.registrationNumber || null,
        address: data.address || null,
        county: data.county || null,
        contactPersonName: data.contactPersonName,
        contactPersonPhone: data.contactPersonPhone,
        contactPersonEmail: data.contactPersonEmail,
        paymentFrequency: data.paymentFrequency,
        effectiveDate: effectiveDateObj,
        renewalDate: renewalDateObj,
        notes: data.notes || null,
        // status intentionally omitted — governed via changeGroupStatus.
      },
    });

    return { before, after: this.profileSnapshot(updated), groupName: updated.name };
  }

  private static profileSnapshot(g: {
    name: string; industry: string | null; registrationNumber: string | null;
    address: string | null; county: string | null; contactPersonName: string;
    contactPersonPhone: string; contactPersonEmail: string;
    paymentFrequency: PaymentFrequency; effectiveDate: Date; renewalDate: Date;
    notes: string | null;
  }): GroupProfileSnapshot {
    return {
      name: g.name,
      industry: g.industry,
      registrationNumber: g.registrationNumber,
      address: g.address,
      county: g.county,
      contactPersonName: g.contactPersonName,
      contactPersonPhone: g.contactPersonPhone,
      contactPersonEmail: g.contactPersonEmail,
      paymentFrequency: g.paymentFrequency,
      effectiveDate: g.effectiveDate.toISOString(),
      renewalDate: g.renewalDate.toISOString(),
      notes: g.notes,
    };
  }

  // ── WP-S2: governed lifecycle ─────────────────────────────────────────────

  static canTransition(from: GroupStatus, to: GroupStatus, override = false): boolean {
    if (from === to) return false;
    if (override) {
      // Governed override: a terminal scheme may be reinstated to ACTIVE only.
      return GROUP_TERMINAL_STATUSES.includes(from) && to === "ACTIVE";
    }
    return GROUP_STATUS_TRANSITIONS[from].includes(to);
  }

  static assertTransition(from: GroupStatus, to: GroupStatus, override = false): void {
    if (this.canTransition(from, to, override)) return;
    if (GROUP_TERMINAL_STATUSES.includes(from) && !override) {
      throw new InvalidGroupTransitionError(
        `Scheme is ${from} (terminal). Reinstatement requires a governed override with a reason.`,
      );
    }
    throw new InvalidGroupTransitionError(
      `Cannot move a scheme from ${from} to ${to}.`,
    );
  }

  /**
   * Governed status change with member-eligibility cascade (WP-S2, S-005/S-006).
   *
   * A manual SUSPEND/LAPSE/TERMINATE cascades to member eligibility exactly like
   * the automated overdue-suspension path (WP-3.5E): active members are swept to
   * the matching status and each member's open coverage period is CLOSED via the
   * existing `coverageService.closeOpenPeriods` primitive — so the point-in-time
   * engine stops treating them as covered from the effective date. Reactivation
   * restores suspended members to ACTIVE and re-opens a coverage period from the
   * effective date (the gap while suspended stays uncovered — correct).
   *
   * All member/coverage writes and the group write happen in ONE `$transaction`,
   * so a crash can never leave the scheme suspended while members stay active.
   * Returns before/after snapshots for the caller's before→after audit event.
   */
  static async changeGroupStatus(
    tenantId: string,
    groupId: string,
    params: { targetStatus: GroupStatus; reason?: string; effectiveDate?: Date; override?: boolean },
    clientId?: string,
  ): Promise<{ before: GroupStatusSnapshot; after: GroupStatusSnapshot; affectedMembers: number; groupName: string }> {
    const { targetStatus, reason, effectiveDate, override = false } = params;

    const group = await prisma.group.findFirst({
      where: { id: groupId, tenantId, ...this.clientWhere(clientId) },
      select: {
        id: true, name: true, status: true,
        suspendedAt: true, suspensionReason: true, terminatedAt: true,
      },
    });
    if (!group) throw new Error("Group not found");

    this.assertTransition(group.status, targetStatus, override);

    const reasonRequired = REASON_REQUIRED_TARGETS.includes(targetStatus) || override;
    const cleanReason = reason?.trim() || undefined;
    if (reasonRequired && !cleanReason) {
      throw new Error(
        override
          ? "A reason is required to reinstate a terminal scheme."
          : `A reason is required to move a scheme to ${targetStatus}.`,
      );
    }

    const effective = effectiveDate ?? new Date();
    if (Number.isNaN(effective.getTime())) throw new Error("Effective date is invalid.");

    const before: GroupStatusSnapshot = {
      status: group.status,
      suspendedAt: group.suspendedAt?.toISOString() ?? null,
      suspensionReason: group.suspensionReason ?? null,
      terminatedAt: group.terminatedAt?.toISOString() ?? null,
    };

    // Group write payload + the member cascade for this target.
    const groupData: Prisma.GroupUpdateInput = { status: targetStatus };
    let affectedMembers = 0;

    await prisma.$transaction(async (tx) => {
      switch (targetStatus) {
        case "SUSPENDED":
          groupData.suspendedAt = effective;
          groupData.suspensionReason = cleanReason ?? null;
          affectedMembers = await this.cascadeMembers(
            tx, tenantId, groupId, ["ACTIVE"], "SUSPENDED", "close", effective, "GROUP_SUSPENDED",
          );
          break;
        case "ACTIVE":
          // Reactivate / governed reinstate — clear the suspension + terminal marks.
          groupData.suspendedAt = null;
          groupData.suspensionReason = null;
          groupData.terminatedAt = null;
          affectedMembers = await this.cascadeMembers(
            tx, tenantId, groupId, ["SUSPENDED"], "ACTIVE", "open", effective, "GROUP_REACTIVATED",
          );
          break;
        case "TERMINATED":
          groupData.terminatedAt = effective;
          affectedMembers = await this.cascadeMembers(
            tx, tenantId, groupId, MEMBER_ON_COVER, "TERMINATED", "close", effective, "GROUP_TERMINATED",
          );
          break;
        case "LAPSED":
          affectedMembers = await this.cascadeMembers(
            tx, tenantId, groupId, MEMBER_ON_COVER, "LAPSED", "close", effective, "GROUP_LAPSED",
          );
          break;
        default:
          // PROSPECT / PENDING — no member cascade (no members on cover yet).
          break;
      }

      await tx.group.update({ where: { id: groupId }, data: groupData });
    });

    const after: GroupStatusSnapshot = {
      status: targetStatus,
      suspendedAt:
        targetStatus === "SUSPENDED" ? effective.toISOString()
        : targetStatus === "ACTIVE" ? null
        : before.suspendedAt,
      suspensionReason:
        targetStatus === "SUSPENDED" ? (cleanReason ?? null)
        : targetStatus === "ACTIVE" ? null
        : before.suspensionReason,
      terminatedAt:
        targetStatus === "TERMINATED" ? effective.toISOString()
        : targetStatus === "ACTIVE" ? null
        : before.terminatedAt,
    };

    return { before, after, affectedMembers, groupName: group.name };
  }

  /**
   * Sweep members of a group between statuses and maintain their coverage
   * periods, reusing the WP-3.5E coverage primitives (never a bespoke rewrite).
   * `op = "close"` ends cover as of `effective`; `op = "open"` re-opens it.
   */
  private static async cascadeMembers(
    tx: Prisma.TransactionClient,
    tenantId: string,
    groupId: string,
    fromStatuses: string[],
    toStatus: string,
    op: "open" | "close",
    effective: Date,
    reason: string,
  ): Promise<number> {
    const inFrom = { in: fromStatuses as MemberStatus[] };
    const members = await tx.member.findMany({
      where: { groupId, status: inFrom },
      select: { id: true },
    });
    if (members.length === 0) return 0;

    await tx.member.updateMany({
      where: { groupId, status: inFrom },
      data: { status: toStatus as MemberStatus },
    });

    for (const m of members) {
      if (op === "close") {
        await coverageService.closeOpenPeriods(tx, m.id, effective, reason);
      } else {
        await coverageService.openPeriod(tx, tenantId, m.id, effective, reason);
      }
    }
    return members.length;
  }

  // ── WP-S3: tiers ──────────────────────────────────────────────────────────

  /**
   * The group's default benefit tier id (or null). This is the mechanism an
   * enrolment path calls to auto-assign a new member's `benefitTierId` when the
   * scheme runs tiers — members otherwise land with a null tier. Accepts a
   * transaction client so it can run inside an enrolment transaction.
   */
  static async resolveDefaultTierId(
    groupId: string,
    client: Prisma.TransactionClient | typeof prisma = prisma,
  ): Promise<string | null> {
    const def = await client.groupBenefitTier.findFirst({
      where: { groupId, isDefault: true },
      select: { id: true },
    });
    return def?.id ?? null;
  }
}
