/**
 * F8.6 — the workspace's only mutation: open a human improvement plan (F7.7). Seam
 * test — the explicit network-analytics permission gate + delegation to F7.7.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const session = vi.hoisted(() => ({ user: { id: "op-1", tenantId: "t1", role: "SUPER_ADMIN", permissions: ["network.analytics.read"] } }));
vi.mock("@/lib/rbac", () => ({ requireRole: vi.fn(async () => session), ROLES: { ADMIN_ONLY: ["SUPER_ADMIN"] } }));
const create = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/provider-improvement-plan/service", () => ({ ProviderImprovementPlanService: { create } }));
vi.mock("@/server/services/provider-performance/network.service", () => ({ NETWORK_ANALYTICS_PERMISSION: "network.analytics.read" }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { createImprovementPlanFromWorkspaceAction } from "@/app/(admin)/network-performance/actions";

beforeEach(() => {
  vi.clearAllMocks();
  session.user.permissions = ["network.analytics.read"];
  create.mockResolvedValue({ id: "plan-1", status: "DRAFT", version: 1 });
});

describe("F8.6 createImprovementPlanFromWorkspaceAction", () => {
  it("delegates to the F7.7 service with a parsed target date and revalidates", async () => {
    const res = await createImprovementPlanFromWorkspaceAction({ providerId: "prov-1", title: "Improve digital rate", objective: "Reach 80%", targetDate: "2026-09-30", baselineMetricRef: "A1_digital_submission_rate" });
    expect(res).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      { userId: "op-1", tenantId: "t1", role: "SUPER_ADMIN" },
      expect.objectContaining({ providerId: "prov-1", title: "Improve digital rate", objective: "Reach 80%", baselineMetricRef: "A1_digital_submission_rate", targetDate: new Date("2026-09-30") }),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/network-performance");
  });

  it("requires the explicit network-analytics permission", async () => {
    session.user.permissions = [];
    const res = await createImprovementPlanFromWorkspaceAction({ providerId: "prov-1", title: "t", objective: "o", targetDate: "2026-09-30" });
    expect(res).toEqual({ error: expect.stringMatching(/permission/i) });
    expect(create).not.toHaveBeenCalled();
  });

  it("requires title, objective, and a target date", async () => {
    const res = await createImprovementPlanFromWorkspaceAction({ providerId: "prov-1", title: "  ", objective: "o", targetDate: "2026-09-30" });
    expect(res).toEqual({ error: expect.any(String) });
    expect(create).not.toHaveBeenCalled();
  });
});
