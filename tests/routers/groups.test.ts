import { describe, it, expect, vi, beforeEach } from "vitest";

// The router delegates to GroupsService — mock it so we test the tRPC INPUT gate
// (schema) + the role gate, not the service internals (covered elsewhere).
const createGroup = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/groups.service", () => ({
  GroupsService: { createGroup, getGroups: vi.fn(), getGroupById: vi.fn() },
  // GROUP_STATUS_TRANSITIONS etc. are unused by the router; omit.
}));

import { groupsRouter } from "@/server/trpc/routers/groups";
import { createCallerFactory } from "@/server/trpc/trpc";
import { ROLES } from "@/lib/authz/roles";

const createCaller = createCallerFactory(groupsRouter);

function caller(role: string) {
  return createCaller({
    session: { user: { id: "u1", role, tenantId: "t1", permissions: [] } },
    tenantId: "t1",
    clientId: undefined,
  } as never);
}

const MEMBER_OPS_ROLE = ROLES.MEMBER_OPS[0];

const validInput: Record<string, unknown> = {
  name: "  Lakeview   Staff Medical Scheme ",
  contactPersonName: "Jane Doe",
  contactPersonPhone: "+256700000000",
  contactPersonEmail: "jane@example.co",
  packageId: "pkg1",
  effectiveDate: "2026-08-01",
};

// Real callers post strings; tRPC statically types a `z.coerce.date()` input as
// `Date` (a zod quirk), so cast the runtime string shape through to exercise the
// actual coercion + validation the HTTP door runs.
function create(role: string, input: Record<string, unknown>) {
  return caller(role).create(input as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  createGroup.mockResolvedValue({ id: "g-new" });
});

describe("groups.create — WP-S1 tRPC door shares the canonical schema", () => {
  it("passes a valid input through the schema to the service (name trimmed, date coerced)", async () => {
    await create(MEMBER_OPS_ROLE, validInput);
    expect(createGroup).toHaveBeenCalledOnce();
    const [tenantId, input] = createGroup.mock.calls[0];
    expect(tenantId).toBe("t1");
    expect(input.name).toBe("Lakeview Staff Medical Scheme");
    expect(input.effectiveDate).toBeInstanceOf(Date);
  });

  it("rejects an invalid effective date at the input boundary (service never called)", async () => {
    await expect(
      create(MEMBER_OPS_ROLE, { ...validInput, effectiveDate: "not-a-date" }),
    ).rejects.toBeTruthy();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it("rejects a blank name at the input boundary", async () => {
    await expect(
      create(MEMBER_OPS_ROLE, { ...validInput, name: "   " }),
    ).rejects.toBeTruthy();
    expect(createGroup).not.toHaveBeenCalled();
  });

  it("denies a non member-ops role (FORBIDDEN) — the tRPC twin is role-gated", async () => {
    await expect(create("OUTSIDER", validInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(createGroup).not.toHaveBeenCalled();
  });
});
