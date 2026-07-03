import { prisma } from "@/lib/prisma";
import type { WellnessActivityType, WellnessProgramType } from "@prisma/client";

/**
 * Preventative care & wellness (Medvex spec §5.16 / gap G5.16). A configurable
 * loss-ratio countermeasure with three pillars in one module:
 *   • SCREENING           — recurring funded preventative checks (cadence)
 *   • CHRONIC_DISEASE_MGMT — managed protocols for target conditions
 *   • INCENTIVE           — activity tracking / gamification points
 *
 * Members enrol into programmes; activities logged against an enrolment award
 * points and, for cadence programmes, advance the next-due date (or complete a
 * one-off screening). Analytics summarise participation for the loss-ratio story.
 */

/** Add whole months to a date, clamping the day to the target month length. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  const result = new Date(d);
  result.setDate(1);
  result.setMonth(targetMonth);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(d.getDate(), lastDay));
  return result;
}

export class WellnessService {
  // ── Programmes ────────────────────────────────────────────────────────
  static async listPrograms(
    tenantId: string,
    opts: { type?: WellnessProgramType; clientId?: string | null; includeInactive?: boolean } = {},
  ) {
    return prisma.wellnessProgram.findMany({
      where: {
        tenantId,
        ...(opts.includeInactive ? {} : { isActive: true }),
        ...(opts.type ? { type: opts.type } : {}),
        ...(opts.clientId !== undefined ? { clientId: opts.clientId } : {}),
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
  }

  static async getProgram(tenantId: string, id: string) {
    return prisma.wellnessProgram.findFirst({ where: { id, tenantId } });
  }

  static async upsertProgram(
    tenantId: string,
    input: {
      id?: string;
      name: string;
      type: WellnessProgramType;
      description?: string;
      clientId?: string | null;
      cadenceMonths?: number | null;
      fundedAmount?: number | null;
      currency?: string;
      targetConditions?: string[];
      pointsReward?: number;
    },
  ) {
    const data = {
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      clientId: input.clientId ?? null,
      cadenceMonths: input.cadenceMonths ?? null,
      fundedAmount: input.fundedAmount ?? null,
      currency: input.currency ?? "UGX",
      targetConditions: input.targetConditions ?? [],
      pointsReward: input.pointsReward ?? 0,
    };
    if (input.id) {
      const existing = await prisma.wellnessProgram.findFirst({ where: { id: input.id, tenantId } });
      if (!existing) throw new Error("Programme not found");
      return prisma.wellnessProgram.update({ where: { id: input.id }, data });
    }
    return prisma.wellnessProgram.create({ data: { tenantId, ...data } });
  }

  static async retireProgram(tenantId: string, id: string) {
    const existing = await prisma.wellnessProgram.findFirst({ where: { id, tenantId } });
    if (!existing) throw new Error("Programme not found");
    return prisma.wellnessProgram.update({
      where: { id },
      data: { isActive: false, effectiveTo: new Date() },
    });
  }

  // ── Enrolment ─────────────────────────────────────────────────────────
  /**
   * Enrol a member into a programme (idempotent per member+programme). For a
   * cadence programme the first checkpoint is scheduled `cadenceMonths` out.
   * Re-enrolling a WITHDRAWN/LAPSED member reactivates the enrolment.
   */
  static async enroll(tenantId: string, programId: string, memberId: string) {
    const program = await prisma.wellnessProgram.findFirst({
      where: { id: programId, tenantId, isActive: true },
      select: { id: true, cadenceMonths: true, clientId: true },
    });
    if (!program) throw new Error("Programme not found or inactive");

    const member = await prisma.member.findFirst({
      where: { id: memberId, tenantId },
      select: { id: true, group: { select: { clientId: true } } },
    });
    if (!member) throw new Error("Member not found");
    // Client-scoped programmes only accept that client's members.
    if (program.clientId && program.clientId !== member.group.clientId) {
      throw new Error("Member does not belong to this programme's client");
    }

    const nextDueDate = program.cadenceMonths ? addMonths(new Date(), program.cadenceMonths) : null;

    const existing = await prisma.wellnessEnrollment.findFirst({ where: { tenantId, programId, memberId } });
    if (existing) {
      if (existing.status === "ACTIVE") return existing;
      return prisma.wellnessEnrollment.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", completedAt: null, nextDueDate },
      });
    }
    return prisma.wellnessEnrollment.create({
      data: { tenantId, programId, memberId, status: "ACTIVE", nextDueDate },
    });
  }

  static async withdraw(tenantId: string, enrollmentId: string) {
    const e = await this.requireEnrollment(tenantId, enrollmentId);
    if (e.status === "WITHDRAWN") return e;
    return prisma.wellnessEnrollment.update({
      where: { id: enrollmentId },
      data: { status: "WITHDRAWN", nextDueDate: null },
    });
  }

  // ── Activities ────────────────────────────────────────────────────────
  /**
   * Log an activity against an enrolment. Awards points (explicit override, else
   * the programme's default), advances the next checkpoint by the cadence, and
   * completes a one-off (no-cadence) screening.
   */
  static async logActivity(
    tenantId: string,
    enrollmentId: string,
    input: { type: WellnessActivityType; description?: string; activityDate?: Date; points?: number; metadata?: unknown },
  ) {
    const e = await prisma.wellnessEnrollment.findFirst({
      where: { id: enrollmentId, tenantId },
      include: { program: { select: { cadenceMonths: true, pointsReward: true, type: true } } },
    });
    if (!e) throw new Error("Enrolment not found");
    if (e.status === "WITHDRAWN") throw new Error("Cannot log activity on a withdrawn enrolment");

    const activityDate = input.activityDate ?? new Date();
    const points = input.points ?? e.program.pointsReward;
    const cadence = e.program.cadenceMonths;
    const isCompletion = cadence == null && e.program.type !== "INCENTIVE";
    const nextDueDate = cadence != null ? addMonths(activityDate, cadence) : e.nextDueDate;

    return prisma.$transaction(async (tx) => {
      const activity = await tx.wellnessActivity.create({
        data: {
          tenantId,
          enrollmentId,
          memberId: e.memberId,
          type: input.type,
          description: input.description ?? null,
          activityDate,
          pointsAwarded: points,
          metadata: (input.metadata ?? undefined) as never,
        },
      });
      const enrollment = await tx.wellnessEnrollment.update({
        where: { id: enrollmentId },
        data: {
          pointsEarned: { increment: points },
          lastActivityAt: activityDate,
          ...(isCompletion
            ? { status: "COMPLETED", completedAt: activityDate, nextDueDate: null }
            : { nextDueDate }),
        },
      });
      return { activity, enrollment };
    });
  }

  // ── Reads / analytics ─────────────────────────────────────────────────
  static async memberSummary(tenantId: string, memberId: string) {
    const enrollments = await prisma.wellnessEnrollment.findMany({
      where: { tenantId, memberId },
      include: { program: { select: { name: true, type: true } } },
      orderBy: { enrolledAt: "desc" },
    });
    const totalPoints = enrollments.reduce((s, e) => s + e.pointsEarned, 0);
    return { enrollments, totalPoints };
  }

  /** Enrolments whose next checkpoint is due on/before `asOf` (for reminders). */
  static async dueScreenings(tenantId: string, asOf: Date = new Date()) {
    return prisma.wellnessEnrollment.findMany({
      where: { tenantId, status: "ACTIVE", nextDueDate: { not: null, lte: asOf } },
      include: {
        program: { select: { name: true, type: true } },
        member: { select: { memberNumber: true, firstName: true, lastName: true } },
      },
      orderBy: { nextDueDate: "asc" },
    });
  }

  static async programAnalytics(tenantId: string) {
    const programs = await prisma.wellnessProgram.findMany({
      where: { tenantId },
      include: { enrollments: { select: { status: true, pointsEarned: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    return programs.map((p) => {
      const total = p.enrollments.length;
      const active = p.enrollments.filter((e) => e.status === "ACTIVE").length;
      const completed = p.enrollments.filter((e) => e.status === "COMPLETED").length;
      const points = p.enrollments.reduce((s, e) => s + e.pointsEarned, 0);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        isActive: p.isActive,
        enrolled: total,
        active,
        completed,
        completionRate: total ? Math.round((completed / total) * 100) : 0,
        totalPoints: points,
      };
    });
  }

  private static async requireEnrollment(tenantId: string, enrollmentId: string) {
    const e = await prisma.wellnessEnrollment.findFirst({ where: { id: enrollmentId, tenantId } });
    if (!e) throw new Error("Enrolment not found");
    return e;
  }
}
