/**
 * Claims Autopilot F2.3 — data-model guard for ClaimProcessingRun / Stage and the
 * Claim intake/processing provenance fields. Runtime enum + field checks; the
 * compound uniques and provenance types are compile-time (enforced by typecheck).
 */
import { describe, it, expect } from "vitest";
import {
  Prisma,
  ClaimProcessingTrigger,
  ClaimProcessingState,
  ClaimProcessingStageName,
  ClaimProcessingStageState,
} from "@prisma/client";

describe("F2.3 — processing enums", () => {
  it("ClaimProcessingState covers the state machine (§6.4)", () => {
    expect(Object.values(ClaimProcessingState).sort()).toEqual(
      ["AUTO_DECIDED", "FAILED", "PENDING", "RETRYABLE", "ROUTED", "RUNNING", "SHADOW_COMPLETE"].sort(),
    );
  });
  it("ClaimProcessingStageName lists the 14 canonical stages (§6.5)", () => {
    expect(Object.values(ClaimProcessingStageName)).toHaveLength(14);
    for (const s of ["CONTEXT", "ELIGIBILITY", "CODING", "DOCUMENTS", "DUPLICATE", "CONTRACT", "PREAUTH", "BENEFIT", "FRAUD", "COST_SHARE", "POLICY", "DECISION", "NOTIFICATION", "AUDIT"]) {
      expect(Object.values(ClaimProcessingStageName)).toContain(s);
    }
  });
  it("ClaimProcessingStageState and Trigger expose the required values", () => {
    expect(Object.values(ClaimProcessingStageState).sort()).toEqual(["FAILED", "PASSED", "PENDING", "ROUTED", "RETRYABLE", "RUNNING", "SKIPPED"].sort());
    expect(Object.values(ClaimProcessingTrigger)).toContain("INITIAL");
    expect(Object.values(ClaimProcessingTrigger)).toContain("RECOVERY");
  });
});

describe("F2.3 — models and uniques", () => {
  it("registers ClaimProcessingRun with lease/retry/sequence fields", () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "ClaimProcessingRun");
    expect(model).toBeDefined();
    const fields = new Set(model!.fields.map((f) => f.name));
    for (const f of ["claimId", "receiptId", "claimRevision", "workflowVersion", "sequence", "trigger", "supersedesRunId", "state", "attemptCount", "nextAttemptAt", "leaseOwner", "leaseExpiresAt", "routeCode", "assignedQueue"]) {
      expect(fields.has(f), `run field ${f}`).toBe(true);
    }
  });

  it("registers ClaimProcessingStage with the (runId, stage) shape", () => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "ClaimProcessingStage");
    expect(model).toBeDefined();
    const fields = new Set(model!.fields.map((f) => f.name));
    for (const f of ["runId", "stage", "state", "attemptCount", "reasonCode", "result", "durationMs"]) {
      expect(fields.has(f), `stage field ${f}`).toBe(true);
    }
  });

  it("run has the (claimId, claimRevision, workflowVersion, sequence) compound unique — compile-time", () => {
    const where: Prisma.ClaimProcessingRunWhereUniqueInput = {
      claimId_claimRevision_workflowVersion_sequence: { claimId: "c1", claimRevision: 1, workflowVersion: "v1", sequence: 1 },
    };
    expect(where.claimId_claimRevision_workflowVersion_sequence?.sequence).toBe(1);
  });

  it("stage has the (runId, stage) compound unique — compile-time", () => {
    const where: Prisma.ClaimProcessingStageWhereUniqueInput = {
      runId_stage: { runId: "run1", stage: ClaimProcessingStageName.CONTRACT },
    };
    expect(where.runId_stage?.stage).toBe("CONTRACT");
  });
});

describe("F2.3 — Claim provenance", () => {
  it("Claim exposes the intake/processing provenance fields and strong-fp unique — compile-time", () => {
    const update: Prisma.ClaimUncheckedUpdateInput = {
      intakeSchemaVersion: "1",
      claimRevision: 2,
      strongEventFingerprint: "strong:v1:abc",
      suspectedDuplicateFingerprint: "suspect:v1:def",
      processingState: ClaimProcessingState.AUTO_DECIDED,
      processingRouteCode: null,
    };
    expect(update.claimRevision).toBe(2);
    const where: Prisma.ClaimWhereUniqueInput = { tenantId_strongEventFingerprint: { tenantId: "t1", strongEventFingerprint: "strong:v1:abc" } };
    expect(where.tenantId_strongEventFingerprint?.tenantId).toBe("t1");
  });
});
