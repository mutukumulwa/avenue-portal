/**
 * Family Hospital UAT plan P03.02 / FH-05 (and the shared AsyncCombobox).
 * Plan acceptance: searching "malaria" finds B54; full keyboard completion
 * works; no price is visible; a slow, superseded response never overwrites a
 * newer one.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const actions = vi.hoisted(() => ({ searchDiagnosesAction: vi.fn(), resolveCaseContextAction: vi.fn(), searchServiceCatalogAction: vi.fn() }));
vi.mock("@/app/provider/capture-actions", () => actions);

import { DiagnosisCombobox } from "@/components/provider/DiagnosisCombobox";
import type { DiagnosisOption } from "@/lib/provider-capture-contract";

const MALARIA: DiagnosisOption[] = [
  { code: "B54", description: "Malaria, unspecified", category: "Certain infectious and parasitic diseases" },
  { code: "B50.9", description: "Plasmodium falciparum malaria, unspecified", category: "Certain infectious and parasitic diseases" },
];

function Harness({ onPick }: { onPick?: (d: DiagnosisOption | null) => void }) {
  const [v, setV] = useState<DiagnosisOption | null>(null);
  return <DiagnosisCombobox purpose="CLAIM" value={v} onChange={(d) => { setV(d); onPick?.(d); }} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.searchDiagnosesAction.mockResolvedValue({ ok: true, options: MALARIA });
});

describe("DiagnosisCombobox", () => {
  it("is an accessible combobox with a label", () => {
    render(<Harness />);
    const box = screen.getByRole("combobox", { name: /Primary diagnosis/ });
    expect(box).toHaveAttribute("aria-autocomplete", "list");
    expect(box).toHaveAttribute("aria-expanded", "false");
  });

  it("does not search before two characters", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "m" } });
    await new Promise((r) => setTimeout(r, 350));
    expect(actions.searchDiagnosesAction).not.toHaveBeenCalled();
  });

  it("finds B54 by the word malaria and selects it with the keyboard", async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "malaria" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    expect(actions.searchDiagnosesAction).toHaveBeenCalledWith({ purpose: "CLAIM", query: "malaria" });
    expect(box).toHaveAttribute("aria-expanded", "true");
    // First option is active; move down and back up, then Enter.
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(box.getAttribute("aria-activedescendant")).toMatch(/opt-0$/);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onPick).toHaveBeenCalledWith(MALARIA[0]);
    expect(screen.getByText("B54")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear diagnosis" })).toBeInTheDocument();
  });

  it("shows code, description and category — and no price", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "malaria" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    const listText = screen.getByRole("listbox").textContent ?? "";
    expect(listText).toContain("Malaria, unspecified");
    expect(listText).not.toMatch(/UGX|KES|\d{3,},\d{3}/);
  });

  it("Escape closes the list, and a second Escape clears the text", async () => {
    render(<Harness />);
    const box = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "malaria" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box).toHaveAttribute("aria-expanded", "false");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.value).toBe("");
  });

  it("ignores a slow response that a newer search superseded", async () => {
    let releaseSlow!: (v: unknown) => void;
    actions.searchDiagnosesAction
      .mockImplementationOnce(() => new Promise((r) => { releaseSlow = r; }))
      .mockResolvedValueOnce({ ok: true, options: [MALARIA[1]] });
    render(<Harness />);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "mal" } });
    await waitFor(() => expect(actions.searchDiagnosesAction).toHaveBeenCalledTimes(1));
    fireEvent.change(box, { target: { value: "falciparum" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await act(async () => releaseSlow({ ok: true, options: MALARIA }));
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("B50.9");
  });

  it("announces a safe error without crashing", async () => {
    actions.searchDiagnosesAction.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "You do not have permission to do this.", correlationId: "c" });
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "malaria" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("You do not have permission to do this."));
  });

  it("clearing the selection returns to the search box", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "malaria" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("option")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Clear diagnosis" }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
