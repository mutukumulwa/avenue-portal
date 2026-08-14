import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedRbac } from "../../prisma/seeds/rbac";
import type { PrismaClient } from "@prisma/client";

/**
 * UAT-HF DEC-16 — `seedRbac` must not resurrect revoked access.
 *
 * Step 4 migrates `User.role` into a `UserRoleAssignment`. It used to look only
 * for an **active** assignment, so a revoked one was invisible and the step
 * re-created it — self-made and self-checked, with no reason recorded.
 *
 * That mattered more than a stray row. Revoking is the *only* permission action
 * the admin UI offers, and provisioning calls `seedRbac`. So the single control
 * an administrator has was undone by the routine command that fixes everything
 * else, silently. Revocation retains the row and stamps `revokedAt`, so the
 * decision was always on the record; it simply was not read.
 */

type Recorder = {
  created: { userId: string; roleId: string }[];
  assignments: { userId: string; roleId: string; isActive: boolean; revokedAt: Date | null }[];
};

/** Minimal fake covering only what seedRbac touches. */
function fakePrisma(rec: Recorder, users: { id: string; role: string }[]) {
  const roleId = (code: string) => `role_${code}`;
  return {
    permission: {
      upsert: vi.fn(async () => ({})),
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => ({
        id: `perm_${where.code}`,
        code: where.code,
      })),
    },
    role: {
      upsert: vi.fn(async ({ create }: { create: { code: string } }) => ({
        id: roleId(create.code),
        code: create.code,
      })),
    },
    rolePermission: { upsert: vi.fn(async () => ({})) },
    user: {
      findFirst: vi.fn(async () => ({ id: "super_admin_1" })),
      findMany: vi.fn(async () => users),
    },
    userRoleAssignment: {
      // Present so the PRE-guard implementation can run too. Without it these
      // tests fail with "findFirst is not a function" — which looks like the
      // guard working and is not.
      findFirst: vi.fn(async ({ where }: { where: { userId: string; roleId: string; isActive?: boolean } }) =>
        rec.assignments.find(
          (a) =>
            a.userId === where.userId &&
            a.roleId === where.roleId &&
            (where.isActive === undefined || a.isActive === where.isActive),
        ) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: { userId: string; roleId: string } }) =>
        rec.assignments.filter((a) => a.userId === where.userId && a.roleId === where.roleId),
      ),
      create: vi.fn(async ({ data }: { data: { userId: string; roleId: string } }) => {
        rec.created.push({ userId: data.userId, roleId: data.roleId });
        return data;
      }),
    },
  } as unknown as PrismaClient;
}

let rec: Recorder;
beforeEach(() => {
  rec = { created: [], assignments: [] };
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("seedRbac step 4 — revoked assignments stay revoked", () => {
  it("does NOT re-create an assignment that was revoked", async () => {
    rec.assignments = [
      { userId: "u1", roleId: "role_CLAIMS_OFFICER", isActive: false, revokedAt: new Date("2026-08-01") },
    ];
    await seedRbac(fakePrisma(rec, [{ id: "u1", role: "CLAIMS_OFFICER" }]), "t1");

    // The whole point: provisioning must not hand back access an administrator
    // took away.
    expect(rec.created).toEqual([]);
  });

  it("still creates one for a user who never had it", async () => {
    // The guard must not break the legitimate migration path.
    await seedRbac(fakePrisma(rec, [{ id: "u2", role: "CLAIMS_OFFICER" }]), "t1");
    expect(rec.created).toEqual([{ userId: "u2", roleId: "role_CLAIMS_OFFICER" }]);
  });

  it("does not duplicate one the user already holds", async () => {
    rec.assignments = [
      { userId: "u3", roleId: "role_UNDERWRITER", isActive: true, revokedAt: null },
    ];
    await seedRbac(fakePrisma(rec, [{ id: "u3", role: "UNDERWRITER" }]), "t1");
    expect(rec.created).toEqual([]);
  });

  it("re-grants when an active assignment exists alongside an older revoked one", async () => {
    // Someone was revoked, then deliberately re-granted. The active row wins;
    // the historical revocation must not lock them out for ever.
    rec.assignments = [
      { userId: "u4", roleId: "role_UNDERWRITER", isActive: false, revokedAt: new Date("2026-07-01") },
      { userId: "u4", roleId: "role_UNDERWRITER", isActive: true, revokedAt: null },
    ];
    await seedRbac(fakePrisma(rec, [{ id: "u4", role: "UNDERWRITER" }]), "t1");
    expect(rec.created).toEqual([]);
  });

  it("an inactive assignment that was never revoked is not treated as a revocation", async () => {
    // e.g. an expired grant. Absent a `revokedAt`, nobody decided to remove it,
    // so the migration path still applies.
    rec.assignments = [
      { userId: "u5", roleId: "role_UNDERWRITER", isActive: false, revokedAt: null },
    ];
    await seedRbac(fakePrisma(rec, [{ id: "u5", role: "UNDERWRITER" }]), "t1");
    expect(rec.created).toEqual([{ userId: "u5", roleId: "role_UNDERWRITER" }]);
  });

  it("skips users whose role is not an enum role at all", async () => {
    await seedRbac(fakePrisma(rec, [{ id: "u6", role: "PROVIDER_USER" }]), "t1");
    expect(rec.created).toEqual([]);
  });
});
