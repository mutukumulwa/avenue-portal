import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  wellnessProgram: {
    findFirst: vi.fn(async (): Promise<any> => null),
    findMany: vi.fn(async (): Promise<any[]> => []),
    create: vi.fn(async (a: any) => ({ id: "p1", ...a.data })),
    update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
  },
  wellnessEnrollment: {
    findFirst: vi.fn(async (): Promise<any> => null),
    findMany: vi.fn(async (): Promise<any[]> => []),
    create: vi.fn(async (a: any) => ({ id: "e1", ...a.data })),
    update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
  },
  wellnessActivity: { create: vi.fn(async (a: any) => ({ id: "a1", ...a.data })) },
  member: { findFirst: vi.fn(async (): Promise<any> => null) },
  $transaction: vi.fn(async (fn: any) => fn(db)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { WellnessService, addMonths } from "@/server/services/wellness.service";

beforeEach(() => vi.clearAllMocks());

describe("addMonths", () => {
  it("adds whole months", () => {
    expect(addMonths(new Date("2026-01-15T00:00:00Z"), 12).getFullYear()).toBe(2027);
  });
  it("clamps to month length (Jan 31 + 1mo → Feb 28)", () => {
    const d = addMonths(new Date(2026, 0, 31), 1); // 31 Jan 2026
    expect(d.getMonth()).toBe(1); // February
    expect(d.getDate()).toBe(28);
  });
});

describe("WellnessService.enroll (G5.16)", () => {
  it("enrols a member and schedules the first checkpoint from cadence", async () => {
    db.wellnessProgram.findFirst.mockResolvedValue({ id: "p1", cadenceMonths: 12, clientId: null });
    db.member.findFirst.mockResolvedValue({ id: "m1", group: { clientId: "c1" } });
    db.wellnessEnrollment.findFirst.mockResolvedValue(null);
    const e = await WellnessService.enroll("t1", "p1", "m1");
    expect(e.status).toBe("ACTIVE");
    expect(db.wellnessEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ programId: "p1", memberId: "m1", nextDueDate: expect.any(Date) }) }),
    );
  });

  it("is idempotent — returns the existing ACTIVE enrolment", async () => {
    db.wellnessProgram.findFirst.mockResolvedValue({ id: "p1", cadenceMonths: null, clientId: null });
    db.member.findFirst.mockResolvedValue({ id: "m1", group: { clientId: "c1" } });
    db.wellnessEnrollment.findFirst.mockResolvedValue({ id: "existing", status: "ACTIVE" });
    const e = await WellnessService.enroll("t1", "p1", "m1");
    expect(e.id).toBe("existing");
    expect(db.wellnessEnrollment.create).not.toHaveBeenCalled();
  });

  it("reactivates a WITHDRAWN enrolment", async () => {
    db.wellnessProgram.findFirst.mockResolvedValue({ id: "p1", cadenceMonths: 6, clientId: null });
    db.member.findFirst.mockResolvedValue({ id: "m1", group: { clientId: "c1" } });
    db.wellnessEnrollment.findFirst.mockResolvedValue({ id: "existing", status: "WITHDRAWN" });
    await WellnessService.enroll("t1", "p1", "m1");
    expect(db.wellnessEnrollment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE", completedAt: null }) }),
    );
  });

  it("rejects a member outside a client-scoped programme (isolation)", async () => {
    db.wellnessProgram.findFirst.mockResolvedValue({ id: "p1", cadenceMonths: null, clientId: "OTHER" });
    db.member.findFirst.mockResolvedValue({ id: "m1", group: { clientId: "c1" } });
    await expect(WellnessService.enroll("t1", "p1", "m1")).rejects.toThrow(/does not belong/i);
  });
});

describe("WellnessService.logActivity", () => {
  it("awards the programme's default points and advances the cadence checkpoint", async () => {
    db.wellnessEnrollment.findFirst.mockResolvedValue({
      id: "e1", memberId: "m1", status: "ACTIVE", nextDueDate: new Date("2026-01-01"),
      program: { cadenceMonths: 12, pointsReward: 50, type: "SCREENING" },
    });
    const { enrollment } = await WellnessService.logActivity("t1", "e1", {
      type: "SCREENING_COMPLETED",
      activityDate: new Date("2026-07-03"),
    });
    expect(db.wellnessActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pointsAwarded: 50 }) }),
    );
    expect(enrollment.pointsEarned).toEqual({ increment: 50 });
    // advanced 12 months from the activity date
    expect(enrollment.nextDueDate!.getFullYear()).toBe(2027);
    expect(enrollment.status).toBeUndefined(); // not completed (cadence programme)
  });

  it("completes a one-off (no-cadence) screening", async () => {
    db.wellnessEnrollment.findFirst.mockResolvedValue({
      id: "e1", memberId: "m1", status: "ACTIVE", nextDueDate: null,
      program: { cadenceMonths: null, pointsReward: 0, type: "SCREENING" },
    });
    const { enrollment } = await WellnessService.logActivity("t1", "e1", { type: "HEALTH_CHECK", points: 10 });
    expect(enrollment.status).toBe("COMPLETED");
    expect(enrollment.completedAt).toBeInstanceOf(Date);
    expect(enrollment.pointsEarned).toEqual({ increment: 10 });
  });

  it("keeps INCENTIVE programmes open (never auto-completes)", async () => {
    db.wellnessEnrollment.findFirst.mockResolvedValue({
      id: "e1", memberId: "m1", status: "ACTIVE", nextDueDate: null,
      program: { cadenceMonths: null, pointsReward: 5, type: "INCENTIVE" },
    });
    const { enrollment } = await WellnessService.logActivity("t1", "e1", { type: "PHYSICAL_ACTIVITY" });
    expect(enrollment.status).toBeUndefined();
    expect(enrollment.pointsEarned).toEqual({ increment: 5 });
  });

  it("blocks logging on a withdrawn enrolment", async () => {
    db.wellnessEnrollment.findFirst.mockResolvedValue({
      id: "e1", memberId: "m1", status: "WITHDRAWN", program: { cadenceMonths: null, pointsReward: 0, type: "INCENTIVE" },
    });
    await expect(WellnessService.logActivity("t1", "e1", { type: "OTHER" })).rejects.toThrow(/withdrawn/i);
  });
});

describe("WellnessService.programAnalytics", () => {
  it("summarises enrolment, completion rate and points per programme", async () => {
    db.wellnessProgram.findMany.mockResolvedValue([
      {
        id: "p1", name: "Annual check", type: "SCREENING", isActive: true,
        enrollments: [
          { status: "COMPLETED", pointsEarned: 50 },
          { status: "ACTIVE", pointsEarned: 0 },
          { status: "COMPLETED", pointsEarned: 50 },
          { status: "WITHDRAWN", pointsEarned: 0 },
        ],
      },
    ]);
    const [row] = await WellnessService.programAnalytics("t1");
    expect(row).toEqual(
      expect.objectContaining({ enrolled: 4, active: 1, completed: 2, completionRate: 50, totalPoints: 100 }),
    );
  });
});
