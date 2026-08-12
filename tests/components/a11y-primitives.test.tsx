/**
 * UAT-HF P01.06 acceptance — "axe/accessibility-tree tests find named inputs/
 * buttons; keyboard focus is always visible; dialog traps/restores focus; table
 * scrolls at 360 px; empty state names reason and next step."
 *
 * Assertions go through testing-library's accessible-name queries (`getByLabelText`,
 * `getByRole(…, { name })`), which resolve the COMPUTED accessibility tree — the
 * same thing a screen reader uses, and the thing DEF-019/056/073/074 were missing.
 */
import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Trash2 } from "lucide-react";

import { Field, TextField } from "@/components/forms/Field";
import { IconButton } from "@/components/ui/IconButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { DISCARD_MESSAGE, isFormDirty } from "@/components/forms/useDirtyFormGuard";

// ── Field ───────────────────────────────────────────────────────────────────
describe("P01.06 Field — DEF-019, DEF-073, DEF-074", () => {
  it("gives every control a computed accessible name", () => {
    render(<TextField name="annualLimit" label="Annual limit" />);
    // DEF-019: package builder money and age fields had NO accessible names.
    expect(screen.getByLabelText("Annual limit")).toBeTruthy();
  });

  it("associates the hint so a screen reader reads it as part of the field", () => {
    render(<TextField name="coverStart" label="Cover start" hint="DD/MM/YYYY" />);
    const input = screen.getByLabelText("Cover start");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe("DD/MM/YYYY");
  });

  it("renders an in-DOM, announced error and links it to the field (DEF-074)", () => {
    render(<TextField name="fullName" label="Full name" error="Enter a full name" />);
    const input = screen.getByLabelText("Full name");
    expect(input.getAttribute("aria-invalid")).toBe("true");

    // The exact failure: "produces no in-DOM error elements at all".
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Enter a full name");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("announces hint before error when both are present", () => {
    render(<TextField name="limit" label="Limit" hint="Numbers only" error="Too large" />);
    const ids = screen.getByLabelText("Limit").getAttribute("aria-describedby")!.split(" ");
    expect(document.getElementById(ids[0])?.textContent).toBe("Numbers only");
    expect(document.getElementById(ids[1])?.textContent).toBe("Too large");
  });

  it("marks required in the accessibility tree, not only with a red asterisk", () => {
    render(<TextField name="fullName" label="Full name" required />);
    const input = screen.getByLabelText(/full name/i);
    expect(input.hasAttribute("required")).toBe(true);
    expect(screen.getByText("(required)")).toBeTruthy();
  });

  it("keeps ids unique when the same field is rendered twice", () => {
    render(
      <>
        <TextField name="rate" label="Rate" />
        <TextField name="rate" label="Rate" />
      </>,
    );
    const [a, b] = screen.getAllByLabelText("Rate");
    expect(a.id).not.toBe(b.id);
  });

  it("exposes a visible focus ring on the control", () => {
    render(<TextField name="x" label="X" />);
    expect(screen.getByLabelText("X").className).toContain("focus-visible:ring");
  });

  it("supports arbitrary controls through the render prop", () => {
    render(
      <Field name="tier" label="Tier">
        {(props) => (
          <select {...props}>
            <option>One</option>
          </select>
        )}
      </Field>,
    );
    expect(screen.getByLabelText("Tier").tagName).toBe("SELECT");
  });
});

// ── IconButton ──────────────────────────────────────────────────────────────
describe("P01.06 IconButton — DEF-056, DEF-081", () => {
  it("is announced by its name, not as a bare 'button'", () => {
    render(<IconButton label="Delete referral rule" icon={<Trash2 size={16} />} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Delete referral rule" })).toBeTruthy();
  });

  it("hides the glyph from assistive tech so the name is not doubled", () => {
    const { container } = render(<IconButton label="Delete" icon={<Trash2 size={16} />} />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it("shows the same text as a tooltip for sighted users", () => {
    render(<IconButton label="Delete referral rule" icon={<Trash2 size={16} />} />);
    expect(screen.getByRole("button", { name: "Delete referral rule" }).getAttribute("title")).toBe(
      "Delete referral rule",
    );
  });
});

// ── ConfirmDialog ───────────────────────────────────────────────────────────
describe("P01.06 ConfirmDialog — DEF-040, DEF-025, DEF-081", () => {
  const base = {
    objectLabel: "UX26-2026-00017 — UX Singleclick Control",
    title: "Terminate cover?",
    consequences: <p>Refund of UGX 1,196,212.33 will be computed. Effective 31 Aug 2026.</p>,
    confirmLabel: "Terminate cover",
  };

  it("names the object, the consequence and the money BEFORE confirming", () => {
    render(<ConfirmDialog open {...base} onConfirm={() => {}} onCancel={() => {}} />);
    // DEF-040 computed exactly this refund with no confirmation at all.
    expect(screen.getByText(/UGX 1,196,212.33/)).toBeTruthy();
    expect(screen.getByText(/UX26-2026-00017/)).toBeTruthy();
  });

  it("is a modal dialog with an accessible name and description", () => {
    render(<ConfirmDialog open {...base} onConfirm={() => {}} onCancel={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Terminate cover?" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("does NOT focus the confirm button, so a stray Enter cannot terminate", () => {
    render(<ConfirmDialog open {...base} onConfirm={() => {}} onCancel={() => {}} />);
    // DEF-040 fired while the tester was merely trying to READ the copy.
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "Terminate cover" }));
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
  });

  it("restores focus to the trigger when it closes", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <ConfirmDialog open={open} {...base} onConfirm={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("cancels on Escape — the safe default", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open {...base} onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires the typed phrase before an irreversible action can be confirmed", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog open {...base} requiredPhrase="UX26-2026-00017" onConfirm={onConfirm} onCancel={() => {}} />,
    );
    const confirm = screen.getByRole("button", { name: "Terminate cover" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/type .* to confirm/i), { target: { value: "wrong" } });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/type .* to confirm/i), { target: { value: "UX26-2026-00017" } });
    expect(confirm.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("traps Tab inside the dialog", () => {
    render(<ConfirmDialog open {...base} onConfirm={() => {}} onCancel={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Terminate cover" });
    confirm.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    // Wrapped back to the first control rather than escaping to the page.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("renders nothing when closed", () => {
    render(<ConfirmDialog open={false} {...base} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ── DataTable ───────────────────────────────────────────────────────────────
describe("P01.06 DataTable — DEF-009, DEF-072, DEF-076", () => {
  type Row = { id: string; name: string };
  const columns = [
    { key: "name", header: "Member", cell: (r: Row) => r.name, sticky: "left" as const },
    { key: "id", header: "Number", cell: (r: Row) => r.id },
  ];
  const rows: Row[] = [{ id: "UX26-2026-00001", name: "Amina Nabirye Kato" }];

  it("scrolls INSIDE itself rather than trapping the page", () => {
    const { container } = render(
      <DataTable caption="Members" columns={columns} rows={rows} rowKey={(r) => r.id} />,
    );
    // min-w-0 is what stops a flex/grid parent forcing a page-level scroll.
    expect(container.firstElementChild?.className).toContain("min-w-0");
    const port = screen.getByRole("region", { name: "Members" });
    expect(port.className).toContain("overflow-x-auto");
  });

  it("makes the scroll port reachable by keyboard", () => {
    render(<DataTable caption="Members" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole("region", { name: "Members" }).getAttribute("tabindex")).toBe("0");
  });

  it("names the table for screen readers via a caption", () => {
    render(<DataTable caption="Members" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole("table", { name: "Members" })).toBeTruthy();
  });

  it("keeps the identity column visible while the rest scrolls", () => {
    render(<DataTable caption="Members" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: "Member" }).className).toContain("sticky");
  });

  it("uses column headers with a scope so cells are attributable", () => {
    render(<DataTable caption="Members" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByRole("columnheader", { name: "Number" }).getAttribute("scope")).toBe("col");
  });

  it("renders the empty state instead of a headless table", () => {
    render(
      <DataTable
        caption="Members"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No members" reason="This scheme has no members yet." />}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No members")).toBeTruthy();
  });
});

// ── EmptyState ──────────────────────────────────────────────────────────────
describe("P01.06 EmptyState — DEF-082", () => {
  it("names the reason, not just the absence", () => {
    render(
      <EmptyState
        title="No facilities in your network nearby"
        reason="We could not determine your location, so we searched from Kampala."
        action={{ label: "Search by district", href: "/member/facilities?mode=manual" }}
        ownerHint="Ask your HR administrator if a facility should be in network."
      />,
    );
    // DEF-007's screen could not distinguish 'no facility' from 'unknown
    // location' from 'not in network' from 'service down'.
    expect(screen.getByText(/could not determine your location/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Search by district" }).getAttribute("href")).toBe(
      "/member/facilities?mode=manual",
    );
    expect(screen.getByText(/ask your HR administrator/i)).toBeTruthy();
  });

  it("supports an action that is a button rather than a link", () => {
    const onClick = vi.fn();
    render(<EmptyState title="Nothing yet" reason="No imports have been run." action={{ label: "Upload a file", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Upload a file" }));
    expect(onClick).toHaveBeenCalled();
  });
});

// ── dirty-form guard ────────────────────────────────────────────────────────
describe("P01.06 dirty-form guard — DEF-008, DEF-016", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("treats a form as clean when a change is typed and undone", () => {
    const initial = { name: "Amina", phone: "" };
    expect(isFormDirty(initial, { name: "Amina", phone: "" })).toBe(false);
    expect(isFormDirty(initial, { name: "Aminah", phone: "" })).toBe(true);
    // Typed then deleted — back to clean, so the user is not nagged.
    expect(isFormDirty(initial, { name: "Amina", phone: "" })).toBe(false);
  });

  it("notices a key present on only one side", () => {
    expect(isFormDirty({ a: "1" }, {})).toBe(true);
    expect(isFormDirty({}, { a: "1" })).toBe(true);
    expect(isFormDirty({ a: "" }, {})).toBe(false);
  });

  it("publishes one discard message so every exit path asks the same question", () => {
    expect(DISCARD_MESSAGE).toMatch(/unsaved changes/i);
  });
});
