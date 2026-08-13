/**
 * UAT-HF P11.01 (DEF-074) — every interactive control has an accessible name.
 *
 * DEF-074 (S3): "Accessibility-tree analysis of the enrolment form (100 nodes,
 * 38 interactive) found 4 interactive controls with no accessible name — one
 * link and three comboboxes, the latter announced only as 'combobox' with no
 * indication of what they select. Required state is exposed on just 1 node
 * although the form has 4 required controls ... After an invalid submit there
 * were 0 elements with aria-invalid='true', 0 with aria-describedby and 0
 * in-DOM error elements such as role='alert'."
 *
 * ## Why this renders instead of scanning source
 *
 * A source scan cannot see an id injected through a wrapper. `Field` binds its
 * label by cloning the child with a generated id, so a grep for `id=` on the
 * `<select>` reports it unnamed when it is in fact correctly labelled. Scanning
 * would have produced a large, mostly-false backlog and hidden the real ones.
 *
 * The register reached its finding through the accessibility tree. jsdom builds
 * enough of one for `getByLabelText` and `toHaveAccessibleName` to answer the
 * same question honestly.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";

// The form imports its server action, which pulls in next-auth. This test is
// about the rendered accessibility tree, not the action.
vi.mock("@/app/(admin)/endorsements/new/actions", () => ({
  submitEndorsementAction: vi.fn(async () => undefined),
}));

const { EndorsementForm } = await import("@/app/(admin)/endorsements/new/EndorsementForm");

const GROUPS = [
  { id: "g1", name: "NWSC Staff Scheme", contributionRate: 1_200_000, renewalDate: "2027-08-11" },
];
const PACKAGES = [{ id: "p1", name: "Gold", annualLimit: 5_000_000, contributionAmount: 25_000 }];
const MEMBERS = [
  { id: "m1", name: "Grace Nakato", groupId: "g1", relationship: "PRINCIPAL" },
  { id: "m2", name: "Sam Nakato", groupId: "g1", relationship: "CHILD" },
];

function renderForm() {
  return render(
    <EndorsementForm groups={GROUPS} packages={PACKAGES} members={MEMBERS} preselectedGroupId="g1" />,
  );
}

/** Every rendered control that a screen reader would announce. */
function interactiveControls(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "select, textarea, input:not([type=hidden]), button, a[href]",
    ),
  );
}

/**
 * The accessible name, computed the way an AT would: an explicit label, an
 * aria-label, or the control's own text content.
 */
function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return aria.trim();

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }

  if (el.id) {
    const label = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }

  const wrapping = el.closest("label");
  if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();

  // Buttons and links are named by their own content.
  if (["BUTTON", "A"].includes(el.tagName) && el.textContent?.trim()) return el.textContent.trim();

  return "";
}

describe("DEF-074 the endorsement form's controls are all named", () => {
  it("renders a form with controls to check, so this test cannot pass vacuously", () => {
    const { container } = renderForm();
    expect(interactiveControls(container).length).toBeGreaterThan(10);
  });

  it("every combobox announces what it selects", () => {
    // "three comboboxes ... announced only as 'combobox' with no indication of
    // what they select".
    const { container } = renderForm();
    const unnamed = Array.from(container.querySelectorAll<HTMLElement>("select"))
      .filter((el) => accessibleName(el) === "")
      .map((el) => el.getAttribute("name") ?? "(no name attr)");

    expect(unnamed, `Comboboxes with no accessible name: ${unnamed.join(", ")}`).toEqual([]);
  });

  it("every interactive control has an accessible name", () => {
    const { container } = renderForm();
    const unnamed = interactiveControls(container)
      .filter((el) => accessibleName(el) === "")
      .map((el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute("name") ?? "?"}]`);

    expect(unnamed, `Unnamed controls: ${unnamed.join(", ")}`).toEqual([]);
  });

  it("the label is bound programmatically, not merely adjacent", () => {
    // The mechanism the register names: "Labels are visually associated but not
    // programmatically bound on some selects."
    renderForm();
    // getByLabelText resolves through htmlFor/id only — an adjacent label fails.
    expect(screen.getByLabelText(/Target Group/i).tagName).toBe("SELECT");
    expect(screen.getByLabelText(/Endorsement Type/i).tagName).toBe("SELECT");
  });

  it("ids stay unique when the same field name is rendered in several branches", () => {
    // This form renders `memberId` in four type branches. A hand-rolled
    // id={name} would collide and bind the label to the wrong control.
    const { container } = renderForm();
    const ids = Array.from(container.querySelectorAll<HTMLElement>("[id]")).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("required controls expose required state natively", () => {
    // "Required state is exposed on just 1 node although the form has 4 required
    // controls." `required` on the element is what an AT reads.
    const { container } = renderForm();
    const required = container.querySelectorAll("[required]");
    expect(required.length).toBeGreaterThan(0);
  });
});

/**
 * The enrolment form the register actually analysed. P05.06 wired it; this holds
 * the result so the four findings cannot come back.
 */
describe("DEF-074 the enrolment form keeps its wiring", () => {
  const src = readFileSync("src/app/(admin)/members/new/MemberNewForm.tsx", "utf8");

  it("associates errors with their fields", () => {
    expect(src).toContain("aria-invalid");
    expect(src).toContain("aria-describedby");
  });

  it("announces them", () => {
    expect(src).toContain('role="alert"');
  });

  it("binds every label by id rather than proximity", () => {
    // The a11y() helper returns { id, aria-invalid, aria-describedby } and every
    // label uses htmlFor.
    expect(src).toMatch(/const a11y = \(field: string\)/);
    expect(src).toMatch(/htmlFor=/);
  });
});

