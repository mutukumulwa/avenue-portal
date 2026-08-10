import { describe, it, expect, vi, beforeEach } from "vitest";

// The router delegates to MembersService — mock it so we test the tRPC INPUT gate
// (schema, incl. the new SIBLING relationship) + the role gate, not the service
// internals (covered in member-enrolment-integrity.test.ts).
const createMember = vi.hoisted(() => vi.fn());
vi.mock("@/server/services/members.service", () => ({
  MembersService: { createMember, getMembers: vi.fn(), getMemberById: vi.fn() },
}));

import { membersRouter } from "@/server/trpc/routers/members";
import { createCallerFactory } from "@/server/trpc/trpc";
import { ROLES } from "@/lib/authz/roles";

const createCaller = createCallerFactory(membersRouter);

function caller(role: string) {
  return createCaller({
    session: { user: { id: "u1", role, tenantId: "t1", permissions: [] } },
    tenantId: "t1",
    clientId: undefined,
  } as never);
}

const MEMBER_OPS_ROLE = ROLES.MEMBER_OPS[0];

const validInput: Record<string, unknown> = {
  groupId: "g1",
  firstName: "John",
  lastName: "Doe",
  dateOfBirth: "1990-01-01",
  gender: "MALE",
  relationship: "PRINCIPAL",
};

function create(role: string, input: Record<string, unknown>) {
  return caller(role).create(input as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  createMember.mockResolvedValue({ member: { id: "m-new" }, warnings: [] });
});

describe("members.create — tRPC door (WP-3.5F)", () => {
  it("passes a valid input through to the service", async () => {
    await create(MEMBER_OPS_ROLE, validInput);
    expect(createMember).toHaveBeenCalledOnce();
    expect(createMember.mock.calls[0][0]).toBe("t1");
    expect(createMember.mock.calls[0][1].firstName).toBe("John");
  });

  it("accepts the new SIBLING relationship at the input boundary", async () => {
    await create(MEMBER_OPS_ROLE, { ...validInput, relationship: "SIBLING" });
    expect(createMember).toHaveBeenCalledOnce();
    expect(createMember.mock.calls[0][1].relationship).toBe("SIBLING");
  });

  it("rejects an unknown relationship (service never called)", async () => {
    await expect(create(MEMBER_OPS_ROLE, { ...validInput, relationship: "COUSIN" })).rejects.toBeTruthy();
    expect(createMember).not.toHaveBeenCalled();
  });

  it("rejects a blank firstName at the input boundary", async () => {
    await expect(create(MEMBER_OPS_ROLE, { ...validInput, firstName: "" })).rejects.toBeTruthy();
    expect(createMember).not.toHaveBeenCalled();
  });

  it("denies a non member-ops role (FORBIDDEN) — the tRPC twin is role-gated", async () => {
    await expect(create("OUTSIDER", validInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(createMember).not.toHaveBeenCalled();
  });
});
