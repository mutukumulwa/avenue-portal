/**
 * Diagnosis Gate C3.1 — wiring guard (execution plan §7, W1/W2).
 *
 * A capability is not "shipped" when its service compiles; it is shipped when a real
 * person holding a real role can reach it. These assertions pin the three places that
 * must agree, because when they drift the failure is silent at build time and loud in
 * production: the permission catalog, the role grants, and the approval-matrix action
 * (enum + seed + dropdown + label map).
 *
 * This is the codified F76-GAP-02 lesson.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ApprovalActionType } from "@prisma/client";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const CLINICAL_PERMISSIONS = [
  "CLINICAL_PROTOCOL:VIEW",
  "CLINICAL_PROTOCOL:MANAGE",
  "CLINICAL_PROTOCOL:APPROVE",
  "CLINICAL_GATE:REVIEW",
];

describe("DG C3.1 — permissions are catalogued and granted (W1)", () => {
  const rbac = read("prisma/seeds/rbac.ts");

  it.each(CLINICAL_PERMISSIONS)("%s exists in the permission catalog", (code) => {
    expect(rbac).toContain(`code: "${code}"`);
  });

  it("uses the STAFF convention (MODULE:ACTION), not the provider-portal dotted form", () => {
    for (const code of CLINICAL_PERMISSIONS) {
      expect(code).toMatch(/^[A-Z_]+:[A-Z_]+$/);
    }
    expect(rbac).not.toContain("clinical.protocol.read");
  });

  it("grants the content-authoring permissions to MEDICAL_OFFICER", () => {
    const block = rbac.slice(rbac.indexOf("MEDICAL_OFFICER: ["), rbac.indexOf("MEDICAL_ADVISOR: ["));
    for (const code of CLINICAL_PERMISSIONS) expect(block, code).toContain(code);
  });

  it("gives CLAIMS_OFFICER the review surface but NOT authoring or approval", () => {
    const block = rbac.slice(rbac.indexOf("CLAIMS_OFFICER: ["), rbac.indexOf("SENIOR_CLAIMS_OFFICER: ["));
    expect(block).toContain("CLINICAL_GATE:REVIEW");
    expect(block).toContain("CLINICAL_PROTOCOL:VIEW");
    // Working the queue must not imply authoring medicine.
    expect(block).not.toContain("CLINICAL_PROTOCOL:MANAGE");
    expect(block).not.toContain("CLINICAL_PROTOCOL:APPROVE");
  });

  it("the ensure-script mirrors the seed, so existing tenants get the same grants", () => {
    // seedRbac only runs at tenant creation; without this script every existing
    // customer would see the feature and be unable to use it.
    const ensure = read("scripts/diagnosis-gate/ensure-tenant-wiring.ts");
    for (const code of CLINICAL_PERMISSIONS) expect(ensure, code).toContain(code);
    expect(ensure).toContain("CLINICAL_PROTOCOL_CHANGE");
  });
});

describe("DG C3.1 — the approval action is wired end to end (W2)", () => {
  it("exists in the Prisma enum", () => {
    expect(Object.values(ApprovalActionType)).toContain("CLINICAL_PROTOCOL_CHANGE");
  });

  it("has a default matrix rule seeded, or submitting content would fail with PRECONDITION_FAILED", () => {
    const svc = read("src/server/services/approval-matrix.service.ts");
    expect(svc).toContain('actionType: "CLINICAL_PROTOCOL_CHANGE"');
    expect(svc).toContain('requiredRole: "MEDICAL_OFFICER"');
  });

  it("is selectable in the approval-matrix screen", () => {
    expect(read("src/app/(admin)/settings/approval-matrix/ApprovalMatrixManager.tsx")).toContain('value: "CLINICAL_PROTOCOL_CHANGE"');
  });

  it("renders with a human label in the approvals queue rather than a raw enum", () => {
    expect(read("src/app/(admin)/approvals/page.tsx")).toContain("CLINICAL_PROTOCOL_CHANGE:");
  });

  it("is dispatched on BOTH approval and rejection", () => {
    const svc = read("src/server/services/approval-request.service.ts");
    // Approved → the pack is marked APPROVED; rejected → it returns to REJECTED so it
    // can be corrected. A missing rejection branch would strand packs in
    // PENDING_APPROVAL forever.
    expect(svc).toContain("applyApprovedPackChange");
    expect(svc).toMatch(/nextStatus === "REJECTED"[\s\S]{0,200}CLINICAL_PROTOCOL_CHANGE/);
  });
});
