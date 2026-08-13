/**
 * UAT-HF P08.03 acceptance — "incomplete request cannot enter an unapprovable
 * state; valid request proceeds through checker to apply once."
 *
 * DEF-046 (S2): "Every approval attempt is refused with 'Material change control
 * (E-015): a source reference or supporting document is required before this
 * endorsement can be approved.' A fresh endorsement was raised with the Notes
 * field carrying an explicit source reference and supporting-document citation —
 * the text renders on the detail page — and E-015 still refused. A full
 * enumeration of the endorsement detail found exactly one input on the whole
 * page: a text box placeholdered 'Rejection reason'. ... Three controlled
 * endorsements raised during this scenario all remain SUBMITTED."
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  EVIDENCE_KEYS,
  MATERIAL_ENDORSEMENT_TYPES,
  MAX_EVIDENCE_LEN,
  readEvidence,
  requiresEvidence,
  validateEvidence,
} from "@/lib/endorsement-evidence";
import { AMENDMENT_RULES, isMaterialAmendment } from "@/server/services/amendment.service";
import type { EndorsementType } from "@prisma/client";

describe("P08.03 the shared list cannot drift from the gate that refuses", () => {
  it("agrees with isMaterialAmendment on EVERY endorsement type", () => {
    // This is the whole reason the module exists. If the form's idea of
    // "material" ever diverges from the service's, the form lets a request
    // through that the gate later refuses — which is DEF-046, exactly.
    for (const type of Object.keys(AMENDMENT_RULES) as EndorsementType[]) {
      expect(requiresEvidence(type), type).toBe(isMaterialAmendment(type));
    }
  });

  it("covers every type in AMENDMENT_RULES, so a new type cannot be forgotten", () => {
    const known = new Set(Object.keys(AMENDMENT_RULES));
    for (const t of MATERIAL_ENDORSEMENT_TYPES) {
      expect(known, `${t} is not a real endorsement type`).toContain(t);
    }
  });

  it("classifies the run's own types correctly", () => {
    expect(requiresEvidence("MEMBER_ADDITION")).toBe(true);
    expect(requiresEvidence("MEMBER_DELETION")).toBe(true);
    // CORRECTION is the irony at the heart of the defect: it was the ONLY type
    // whose form had a document-reference field, and it never needed one.
    expect(requiresEvidence("CORRECTION")).toBe(false);
    expect(requiresEvidence("GROUP_DATA_CHANGE")).toBe(false);
  });
});

describe("P08.03 reading evidence off a change", () => {
  it("accepts sourceReference", () => {
    expect(readEvidence({ sourceReference: "HR/2026/114" })).toBe("HR/2026/114");
  });

  it("still accepts the legacy keys, for rows already in the database", () => {
    expect(readEvidence({ docRef: "letter" })).toBe("letter");
    expect(readEvidence({ documentReference: "board min 7" })).toBe("board min 7");
  });

  it("does NOT accept notes — the key the form used to write", () => {
    // "A fresh endorsement was raised with the Notes field carrying an explicit
    // source reference ... and E-015 still refused."
    expect(readEvidence({ notes: "Board resolution 2026/14, HR letter attached" })).toBeNull();
  });

  it("treats whitespace as absent", () => {
    expect(readEvidence({ sourceReference: "   " })).toBeNull();
  });

  it("trims what it returns", () => {
    expect(readEvidence({ sourceReference: "  ref-9  " })).toBe("ref-9");
  });

  it("survives null, undefined and non-objects", () => {
    expect(readEvidence(null)).toBeNull();
    expect(readEvidence(undefined)).toBeNull();
    expect(readEvidence("nonsense")).toBeNull();
  });

  it("prefers the canonical key when several are present", () => {
    expect(readEvidence({ docRef: "old", sourceReference: "new" })).toBe("new");
    expect(EVIDENCE_KEYS[0]).toBe("sourceReference");
  });
});

describe("P08.03 validation at CREATION, not at approval", () => {
  it("refuses a material change with no reference", () => {
    const r = validateEvidence({ type: "MEMBER_DELETION", sourceReference: "" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.message).toMatch(/moves money or eligibility/i);
    // Says what to do, not merely that something is wrong.
    expect(r.message).toMatch(/letter, resolution or instruction/i);
  });

  it("accepts a material change WITH a reference", () => {
    const r = validateEvidence({ type: "MEMBER_DELETION", sourceReference: "HR letter 2026-08-11" });
    expect(r).toEqual({ ok: true, value: "HR letter 2026-08-11" });
  });

  it("accepts a material change with a linked document instead", () => {
    // E-015 has always allowed either. Demanding the text field too would
    // refuse a request the gate would have passed.
    const r = validateEvidence({ type: "MEMBER_ADDITION", sourceReference: "", hasLinkedDocument: true });
    expect(r.ok).toBe(true);
  });

  it("exempts a non-material change", () => {
    // Requiring evidence everywhere trains operators to type "n/a", which
    // populates the field, satisfies the gate, and proves nothing.
    expect(validateEvidence({ type: "GROUP_DATA_CHANGE", sourceReference: "" }).ok).toBe(true);
  });

  it("still keeps an optional reference on a non-material change", () => {
    const r = validateEvidence({ type: "GROUP_DATA_CHANGE", sourceReference: "note-1" });
    expect(r).toEqual({ ok: true, value: "note-1" });
  });

  it("bounds the length", () => {
    const r = validateEvidence({ type: "MEMBER_ADDITION", sourceReference: "x".repeat(MAX_EVIDENCE_LEN + 1) });
    expect(r.ok).toBe(false);
  });

  it("accepts exactly the maximum", () => {
    expect(validateEvidence({ type: "MEMBER_ADDITION", sourceReference: "x".repeat(MAX_EVIDENCE_LEN) }).ok).toBe(true);
  });

  it("treats a whitespace-only reference as missing", () => {
    // Otherwise a space satisfies E-015 and the control is decorative.
    expect(validateEvidence({ type: "MEMBER_ADDITION", sourceReference: "    " }).ok).toBe(false);
  });
});

describe("P08.03 the creation form finally has the field", () => {
  const form = readFileSync("src/app/(admin)/endorsements/new/EndorsementForm.tsx", "utf8");
  const action = readFileSync("src/app/(admin)/endorsements/new/actions.ts", "utf8");

  it("renders a sourceReference input", () => {
    // "A full enumeration of the endorsement detail found exactly one input on
    // the whole page: a text box placeholdered 'Rejection reason'."
    expect(form).toContain('name="sourceReference"');
  });

  it("marks it required only for material types, from the shared rule", () => {
    expect(form).toContain("requiresEvidence(type)");
    expect(form).toContain("required={needsEvidence}");
  });

  it("stops inviting source references into Notes", () => {
    // The old placeholder read "Any context, HR approval references, or special
    // instructions…" — the form asked for the very thing the gate ignored.
    expect(form).not.toMatch(/HR approval references/);
    expect(form).toMatch(/Notes are not a source reference/i);
  });

  it("the action validates and writes the canonical key", () => {
    expect(action).toContain("validateEvidence");
    expect(action).toContain("changeDetails.sourceReference");
  });

  it("the action refuses rather than creating an unapprovable request", () => {
    expect(action).toMatch(/if \(!evidence\.ok\)/);
  });
});

describe("P08.03 the review page stops promising an approval it cannot deliver", () => {
  const page = readFileSync("src/app/(admin)/endorsements/[id]/page.tsx", "utf8");

  it("states the evidence position before the decision", () => {
    expect(page).toContain("readEvidence");
    expect(page).toMatch(/No authorising document yet/);
    expect(page).toMatch(/Authorising document recorded/);
  });

  it("hides BOTH approve controls when the gate must refuse", () => {
    // There are two: the header "Approve & Apply" on the legacy engine, and the
    // amendment-engine "Approve". The run pressed the header one. Gating only
    // one would leave the dead end in place.
    const gated = page.match(/!evidenceMissing/g) ?? [];
    expect(gated.length).toBeGreaterThanOrEqual(2);
  });

  it("tells the checker why, and that they may not supply it themselves", () => {
    expect(page).toMatch(/cannot be approved until the person who raised it/i);
    expect(page).toMatch(/supplying\s+the evidence and then approving on it is not a review/i);
  });

  it("offers the maker a way to record it without re-raising", () => {
    expect(page).toContain("supplyEndorsementEvidenceAction");
    expect(page).toMatch(/isMaker && evidenceMissing/);
  });
});

describe("P08.03 the service is still the backstop", () => {
  const svc = readFileSync("src/server/services/amendment.service.ts", "utf8");

  it("the gate reads evidence through the shared module", () => {
    expect(svc).toContain("readEvidence(endorsement.changeDetails)");
    // The inlined key list is gone — that duplication is how the form came to
    // write a key the gate never accepted.
    expect(svc).not.toMatch(/\["sourceReference", "documentReference", "docRef"\]/);
  });

  it("supplyMaterialEvidence is maker-only", () => {
    const fn = svc.slice(svc.indexOf("async supplyMaterialEvidence"));
    expect(fn.slice(0, 3000)).toContain("endorsement.requestedBy !== actorId");
  });

  it("refuses to overwrite evidence already recorded", () => {
    const fn = svc.slice(svc.indexOf("async supplyMaterialEvidence"));
    expect(fn.slice(0, 3000)).toContain("readEvidence(endorsement.changeDetails)");
    expect(fn.slice(0, 3000)).toMatch(/already carries a source reference/i);
  });

  it("refuses once a decision has been made", () => {
    const fn = svc.slice(svc.indexOf("async supplyMaterialEvidence"));
    expect(fn.slice(0, 3000)).toMatch(/\["DRAFT", "SUBMITTED", "UNDER_REVIEW"\]/);
  });

  it("audits the supply", () => {
    const fn = svc.slice(svc.indexOf("async supplyMaterialEvidence"));
    expect(fn.slice(0, 3000)).toContain("AMENDMENT:EVIDENCE_SUPPLIED");
  });

  it("the refusal message now names the way out", () => {
    expect(svc).toMatch(/maker can add one on this endorsement without raising it again/i);
  });
});
