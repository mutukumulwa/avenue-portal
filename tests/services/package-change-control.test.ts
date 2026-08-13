/**
 * UAT-HF P09.01 acceptance — "maker save cannot change live member eligibility;
 * approval activates exactly one version at effective time; history is
 * immutable."
 *
 * DEF-024 (S2): "A single underwriter changed a live ACTIVE package (enabled
 * DENTAL at UGX 10,000) and the change took effect immediately as version v5
 * 'Current', with no approval requested, no Draft/Pending/Approved state, and
 * no feedback message of any kind ... Separation of duties is absent on this
 * object: the checker sees the same package with the same 'Edit' control, so the
 * checker is a second maker rather than a reviewer."
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  PACKAGE_ACTIVATION_ACTION,
  activateApprovedVersion,
  canTransition,
  isEffective,
  mayApprove,
} from "@/server/services/package-change-control.service";

const findFirst = vi.fn();
const updateMany = vi.fn();
const pkgUpdate = vi.fn();
const db = {
  packageVersion: { findFirst, updateMany },
  package: { update: pkgUpdate },
} as never;

beforeEach(() => {
  findFirst.mockReset();
  updateMany.mockReset().mockResolvedValue({ count: 1 });
  pkgUpdate.mockReset().mockResolvedValue({});
});

describe("P09.01 the lifecycle a coverage change must walk", () => {
  it("a draft can only go for approval", () => {
    expect(canTransition("DRAFT", "PENDING_APPROVAL").ok).toBe(true);
    // The defect in one assertion: a draft cannot become live directly.
    expect(canTransition("DRAFT", "ACTIVE").ok).toBe(false);
  });

  it("only an APPROVED version may become ACTIVE", () => {
    expect(canTransition("APPROVED", "ACTIVE").ok).toBe(true);
    expect(canTransition("PENDING_APPROVAL", "ACTIVE").ok).toBe(false);
    expect(canTransition("REJECTED", "ACTIVE").ok).toBe(false);
  });

  it("history is immutable — a superseded version goes nowhere", () => {
    for (const to of ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"] as const) {
      expect(canTransition("SUPERSEDED", to).ok, to).toBe(false);
    }
  });

  it("a rejected version can be reworked", () => {
    expect(canTransition("REJECTED", "DRAFT").ok).toBe(true);
  });

  it("explains a refusal in words, not a code", () => {
    expect(canTransition("DRAFT", "ACTIVE").ok).toBe(false);
    expect(canTransition("DRAFT", "ACTIVE")).toMatchObject({
      reason: expect.stringContaining("cannot move to"),
    });
  });
});

describe("P09.01 the maker may not be the checker (DEC-03)", () => {
  it("refuses a self-approval", () => {
    // "the checker is a second maker rather than a reviewer"
    const verdict = mayApprove("u-alice", "u-alice");
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringMatching(/you submitted this change/i) });
  });

  it("allows a different checker", () => {
    expect(mayApprove("u-alice", "u-bob").ok).toBe(true);
  });

  it("fails CLOSED when the maker is unknown", () => {
    // A version with no recorded author cannot be shown to have been reviewed
    // by somebody else, and "we could not tell" must not mean "approved".
    expect(mayApprove(null, "u-bob").ok).toBe(false);
    expect(mayApprove(undefined, "u-bob").ok).toBe(false);
  });
});

describe("P09.01 activation is effective-dated", () => {
  const past = new Date("2026-01-01");
  const future = new Date("2099-01-01");

  it("an effective date in the past is live now", () => {
    expect(isEffective(past)).toBe(true);
  });

  it("a future effective date is not", () => {
    expect(isEffective(future)).toBe(false);
  });

  it("an unparseable date is never effective — fail closed", () => {
    expect(isEffective("nonsense")).toBe(false);
  });

  it("refuses to activate before the effective date, and says when", async () => {
    findFirst.mockResolvedValue({ status: "APPROVED", effectiveFrom: future });
    const result = await activateApprovedVersion(db, { packageId: "p1", versionId: "v2" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toMatch(/2099-01-01/);
    expect(pkgUpdate).not.toHaveBeenCalled();
  });
});

describe("P09.01 activation points exactly one version", () => {
  it("claims the version conditionally, so two checkers cannot both win", async () => {
    findFirst.mockResolvedValue({ status: "APPROVED", effectiveFrom: new Date("2026-01-01") });
    await activateApprovedVersion(db, { packageId: "p1", versionId: "v2" });

    const claim = updateMany.mock.calls[0][0];
    expect(claim.where).toEqual({ id: "v2", status: "APPROVED" });
    expect(claim.data).toEqual({ status: "ACTIVE" });
  });

  it("supersedes the previously active version", async () => {
    findFirst.mockResolvedValue({ status: "APPROVED", effectiveFrom: new Date("2026-01-01") });
    await activateApprovedVersion(db, { packageId: "p1", versionId: "v2" });

    const supersede = updateMany.mock.calls[1][0];
    expect(supersede.where).toMatchObject({ packageId: "p1", status: "ACTIVE", NOT: { id: "v2" } });
    expect(supersede.data).toEqual({ status: "SUPERSEDED" });
  });

  it("repoints the package only after the claim succeeds", async () => {
    findFirst.mockResolvedValue({ status: "APPROVED", effectiveFrom: new Date("2026-01-01") });
    const result = await activateApprovedVersion(db, { packageId: "p1", versionId: "v2" });
    expect(result.ok).toBe(true);
    expect(pkgUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { currentVersionId: "v2" },
    });
  });

  it("a lost race changes nothing", async () => {
    findFirst.mockResolvedValue({ status: "APPROVED", effectiveFrom: new Date("2026-01-01") });
    updateMany.mockResolvedValueOnce({ count: 0 }); // somebody else claimed it

    const result = await activateApprovedVersion(db, { packageId: "p1", versionId: "v2" });
    expect(result.ok).toBe(false);
    // Crucially: the previously active version is NOT superseded and the
    // pointer is NOT moved.
    expect(pkgUpdate).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("refuses a version that is not approved", async () => {
    findFirst.mockResolvedValue({ status: "PENDING_APPROVAL", effectiveFrom: new Date("2026-01-01") });
    const result = await activateApprovedVersion(db, { packageId: "p1", versionId: "v2" });
    expect(result.ok).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("P09.01 the maker's save no longer touches live eligibility", () => {
  const actions = readFileSync("src/app/(admin)/packages/[id]/edit/actions.ts", "utf8");

  it("does not repoint currentVersionId", () => {
    // This one line WAS the defect: creating a version and pointing live
    // eligibility at it were a single act.
    expect(actions).not.toMatch(/currentVersionId:\s*newVersion\.id/);
  });

  it("creates the version as a DRAFT", () => {
    expect(actions).toMatch(/status:\s*"DRAFT"/);
  });

  it("records the maker, so the checker can be required to differ", () => {
    expect(actions).toContain("submittedById: session.user.id");
  });
});

describe("P09.01 approval is routed into the existing engine", () => {
  const changeControl = readFileSync(
    "src/app/(admin)/packages/[id]/edit/change-control-actions.ts",
    "utf8",
  );

  it("enforces separation of duties on approve AND reject", () => {
    const approve = changeControl.slice(changeControl.indexOf("approvePackageVersionAction"));
    const reject = changeControl.slice(changeControl.indexOf("rejectPackageVersionAction"));
    expect(approve.slice(0, 2500)).toContain("mayApprove(");
    expect(reject.slice(0, 2500)).toContain("mayApprove(");
  });

  it("uses the approval engine's action type", () => {
    expect(PACKAGE_ACTIVATION_ACTION).toBe("PACKAGE_VERSION_ACTIVATION");
    expect(changeControl).toContain("PACKAGE_ACTIVATION_ACTION");
  });

  it("requires a reason to reject, so the maker knows what to change", () => {
    expect(changeControl).toMatch(/Say why you are rejecting this/);
  });

  it("audits submit, approve, reject and activate separately", () => {
    for (const action of [
      "PACKAGE_VERSION_SUBMITTED",
      "PACKAGE_VERSION_APPROVED",
      "PACKAGE_VERSION_REJECTED",
      "PACKAGE_VERSION_ACTIVATED",
    ]) {
      expect(changeControl, action).toContain(action);
    }
  });
});

describe("P09.01 members are not migrated by an approval", () => {
  it("activation touches no member or group row", async () => {
    // DEC-03: "Schemes and members stay pinned to their current approved
    // version until a governed migration moves them." Silently moving live
    // members onto a new version is what the approval protects against.
    findFirst.mockResolvedValue({ status: "APPROVED", effectiveFrom: new Date("2026-01-01") });
    const service = readFileSync(
      "src/server/services/package-change-control.service.ts",
      "utf8",
    );
    expect(service).not.toMatch(/\btx\.member\b/);
    expect(service).not.toMatch(/\btx\.group\b/);
  });
});
