/**
 * Family Hospital UAT plan P03.03 / FH-02, FH-06, FH-07 — the category-first
 * service line editor. §8.4 oracle: category filters the search and changing it
 * clears an incompatible selection; "Service code" is optional; a line can be
 * completed by description; the contracted rate is shown apart from the billed
 * price; no global CPT price anywhere.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const actions = vi.hoisted(() => ({ searchServiceCatalogAction: vi.fn(), resolveCaseContextAction: vi.fn(), searchDiagnosesAction: vi.fn() }));
vi.mock("@/app/provider/capture-actions", () => actions);

import { ServiceLineEditor, newLine, toCaptureLineInputs, type CaptureLineState } from "@/components/provider/ServiceLineEditor";
import type { CaseContextDTO, ServiceSearchRow } from "@/lib/provider-capture-contract";

const CONTEXT: CaseContextDTO = {
  memberRef: "mem-1", displayName: "Julius Mugerwa", maskedMemberNumber: "•••• 0001",
  eligibility: { eligible: true, reasonCode: "ELIGIBLE", message: "Covered on this date." },
  schemeName: null, packageName: null, branch: { id: "br-main", name: "Main" },
  contract: { id: "con-1", number: "PC-2026-202", versionId: "ver-1" }, currency: "UGX",
  serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT", catalogueEnabled: true,
  unlisted: { allowed: true, rule: "REFER_FOR_REVIEW", label: "Not in contracted tariff — manual review." },
};

const FBC: ServiceSearchRow = {
  tariffId: "t-fbc", serviceName: "Full Blood Count", providerServiceCode: null, cptCode: null, category: "LABORATORY",
  taxonomyName: "Laboratory", unitRate: "25000", currency: "UGX", unitLabel: "per item", requiresPreauth: false,
  effectiveFrom: "2026-08-28", selectable: true, unavailableReason: null,
};
const AMBIG: ServiceSearchRow = { ...FBC, tariffId: "t-amb", serviceName: "Azithromycin 500Mg", category: "LABORATORY", selectable: false, unavailableReason: "Appears more than once in your price list with different prices." };

/** The lines as last reported through onChange ([] = no change reported yet). */
let latest: CaptureLineState[] = [];
function Harness({ context = CONTEXT, initial }: { context?: CaseContextDTO | null; initial?: CaptureLineState[] }) {
  const [lines, setLines] = useState<CaptureLineState[]>(initial ?? [{ ...newLine("LABORATORY"), key: "k1" }]);
  const report = (next: CaptureLineState[]) => {
    latest = next;
    setLines(next);
  };
  return <ServiceLineEditor purpose="CLAIM" context={context} lines={lines} onChange={report} errors={{}} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  latest = [];
  actions.searchServiceCatalogAction.mockResolvedValue({ ok: true, rows: [FBC, AMBIG], total: 2, hasMore: false, otherCategoryMatches: [] });
});

/** Search-result options only (the category <select> has options too). */
const results = () => within(screen.getByRole("listbox", { name: "Line 1 service" }));

async function searchAndPick(text: string, optionName: RegExp) {
  fireEvent.change(screen.getByRole("combobox", { name: /Line 1 service/ }), { target: { value: text } });
  await waitFor(() => expect(results().getAllByRole("option").length).toBeGreaterThan(0));
  fireEvent.click(results().getByRole("option", { name: optionName }));
}

describe("ServiceLineEditor", () => {
  it("is disabled, with a reason, until a case is resolved", () => {
    render(<Harness context={null} />);
    expect(screen.getByText(/Find the member first/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Line 1 service/ })).toBeDisabled();
  });

  it("searches the facility's price list INSIDE the chosen category", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /Line 1 service/ }), { target: { value: "blood" } });
    await waitFor(() => expect(actions.searchServiceCatalogAction).toHaveBeenCalled());
    expect(actions.searchServiceCatalogAction).toHaveBeenCalledWith({
      context: { purpose: "CLAIM", memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT" },
      category: "LABORATORY",
      query: "blood",
    });
  });

  it("selecting suggests the contracted rate as the billed price, shown apart from the contracted rate", async () => {
    render(<Harness />);
    await searchAndPick("blood", /Full Blood Count/);
    expect((screen.getByLabelText(/Billed unit price/) as HTMLInputElement).value).toBe("25,000");
    const line = screen.getByRole("listitem", { name: "Line 1" });
    expect(within(line).getByText("Contracted rate").nextElementSibling).toHaveTextContent("UGX 25,000");
    expect(latest[0].serviceCategory).toBe("LABORATORY"); // selecting never changes category
    // The billed price stays editable and independent of the contracted rate.
    fireEvent.change(screen.getByLabelText(/Billed unit price/), { target: { value: "30,000" } });
    expect(within(line).getByText("Contracted rate").nextElementSibling).toHaveTextContent("UGX 25,000");
    expect(within(line).getByText("Line total").nextElementSibling).toHaveTextContent("UGX 30,000");
  });

  it("an ambiguous row is visible but cannot be chosen", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /Line 1 service/ }), { target: { value: "azi" } });
    await waitFor(() => expect(results().getAllByRole("option")).toHaveLength(2));
    const blocked = results().getByRole("option", { name: /Azithromycin 500Mg, unavailable/ });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(blocked);
    expect(latest).toEqual([]); // no change was reported at all
    expect(screen.getByRole("combobox", { name: /Line 1 service/ })).toBeInTheDocument();
  });

  it("changing category clears a selection from another category", async () => {
    render(<Harness />);
    await searchAndPick("blood", /Full Blood Count/);
    expect(latest[0].selected?.tariffId).toBe("t-fbc");
    fireEvent.change(screen.getByLabelText(/Line 1 category/), { target: { value: "PHARMACY" } });
    expect(latest[0].selected).toBeNull();
    expect(screen.getByRole("combobox", { name: /Line 1 service/ })).toBeInTheDocument();
  });

  it("offers the other category when the text matched only there", async () => {
    actions.searchServiceCatalogAction.mockResolvedValue({ ok: true, rows: [], total: 0, hasMore: false, otherCategoryMatches: [{ category: "OTHER", count: 1 }] });
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /Line 1 service/ }), { target: { value: "extraction" } });
    const move = await screen.findByRole("button", { name: /Other \(1\)/ });
    fireEvent.click(move);
    expect(latest[0].serviceCategory).toBe("OTHER");
  });

  it("a description-first line for an unlisted service is labelled for manual review", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Service not on the price list" }));
    fireEvent.change(screen.getByLabelText(/Line 1 service description/), { target: { value: "Special dressing" } });
    expect(screen.getByText("Not in contracted tariff — manual review.")).toBeInTheDocument();
    expect(screen.queryByText(/CPT/)).not.toBeInTheDocument(); // no code is required anywhere
  });

  it("with the catalogue off: manual lines only, 'contract rate unavailable — manual review'", () => {
    render(<Harness context={{ ...CONTEXT, catalogueEnabled: false }} />);
    expect(screen.getByText(/Contract rate unavailable — manual review/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Line 1 service description/)).toBeInTheDocument();
    // (The category <select> is a combobox too; the SEARCH box must be absent.)
    expect(screen.queryByRole("combobox", { name: /Line 1 service/ })).not.toBeInTheDocument();
  });

  it("adds and removes lines with named controls, and totals in the case currency", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove line 2" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await searchAndPick("blood", /Full Blood Count/);
    fireEvent.change(screen.getByLabelText(/^Qty/), { target: { value: "3" } });
    expect(screen.getByText("UGX 75,000", { selector: "span" })).toBeInTheDocument();
  });

  it("a refused search (e.g. the case went stale) is announced safely, with nothing to pick", async () => {
    actions.searchServiceCatalogAction.mockResolvedValue({ ok: false, code: "CONTEXT_INVALID", message: "The patient details changed. Find the member again.", correlationId: "c" });
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: /Line 1 service/ }), { target: { value: "blood" } });
    await waitFor(() => expect(screen.getByText("The patient details changed. Find the member again.")).toBeInTheDocument());
    expect(results().queryAllByRole("option")).toHaveLength(0);
  });

  it("submits only the tariff id and the billed price — never a rate, name or currency", async () => {
    render(<Harness />);
    await searchAndPick("blood", /Full Blood Count/);
    fireEvent.change(screen.getByLabelText(/Billed unit price/), { target: { value: "30 000" } });
    expect(toCaptureLineInputs(latest)).toEqual([
      { selectedProviderTariffId: "t-fbc", serviceCategory: "LABORATORY", description: undefined, quantity: "1", billedUnitPrice: "30000" },
    ]);
  });
});
