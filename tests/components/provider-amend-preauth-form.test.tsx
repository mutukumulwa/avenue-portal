/**
 * Family Hospital UAT plan P04.03 / P08.01 — requesting more on an APPROVED
 * pre-authorisation. The parent's member, date and benefit are fixed (no number
 * box); the additional service comes from the facility's price list; the
 * estimate is suggested from the contracted rate and "600,000" is accepted; a
 * refusal keeps everything typed; there is no CPT box and no global price.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });

const capture = vi.hoisted(() => ({ resolveCaseContextAction: vi.fn(), searchDiagnosesAction: vi.fn(), searchServiceCatalogAction: vi.fn() }));
vi.mock("@/app/provider/capture-actions", () => capture);
const amend = vi.hoisted(() => ({ amendProviderPreauthAction: vi.fn() }));
vi.mock("@/app/provider/preauth/[id]/actions", () => amend);

import { AmendPreauthForm } from "@/app/provider/preauth/[id]/AmendPreauthForm";
import { mutationFail } from "@/lib/mutation-contract";
import type { CaseContextDTO } from "@/lib/provider-capture-contract";

const DTO: CaseContextDTO = {
  memberRef: "mem-1", displayName: "Amani Testmember", maskedMemberNumber: "•••• 0001",
  eligibility: { eligible: true, reasonCode: "ELIGIBLE", message: "Covered on this date." }, schemeName: null, packageName: null,
  branch: { id: "br-main", name: "Main" }, contract: { id: "con-fh", number: "PC-2026-202", versionId: "ver-fh" }, currency: "UGX",
  serviceDate: "2026-09-20", benefitCategory: "SURGICAL", catalogueEnabled: true,
  unlisted: { allowed: true, rule: "REFER_FOR_REVIEW", label: "Not in contracted tariff — manual review." },
};
const EXCISION = {
  tariffId: "t-exc", serviceName: "Excision of Dermatosis papulosa nigra (less than 5 lesions)", providerServiceCode: null, cptCode: null, category: "PROCEDURE",
  taxonomyName: "Procedure", unitRate: "270000", currency: "UGX", unitLabel: "per procedure", requiresPreauth: false, effectiveFrom: "2026-08-28", selectable: true, unavailableReason: null,
};

function renderForm() {
  render(<AmendPreauthForm parentPreAuthId="pa-parent" member={{ memberRef: "mem-1", displayName: "Amani Testmember" }} serviceDate="2026-09-20" benefitCategory="SURGICAL" />);
  fireEvent.click(screen.getByRole("button", { name: /Amend \(request more\)/ }));
}

async function chooseExcision() {
  await waitFor(() => expect(screen.getByText("•••• 0001")).toBeInTheDocument());
  fireEvent.change(screen.getByRole("combobox", { name: /Line 1 service/ }), { target: { value: "excision" } });
  const list = await screen.findByRole("listbox", { name: "Line 1 service" });
  await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(1));
  fireEvent.click(within(list).getByRole("option"));
}

beforeEach(() => {
  vi.resetAllMocks();
  capture.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
  capture.searchServiceCatalogAction.mockResolvedValue({ ok: true, rows: [EXCISION], total: 1, hasMore: false, otherCategoryMatches: [] });
  amend.amendProviderPreauthAction.mockResolvedValue(undefined);
});

describe("AmendPreauthForm", () => {
  it("fixes the parent's member, date and benefit — no number box, no CPT box", async () => {
    renderForm();
    await waitFor(() => expect(capture.resolveCaseContextAction).toHaveBeenCalled());
    expect(capture.resolveCaseContextAction).toHaveBeenCalledWith(expect.objectContaining({ purpose: "PREAUTH", memberRef: "mem-1", serviceDate: "2026-09-20", benefitCategory: "SURGICAL" }));
    expect(screen.queryByLabelText(/Member \/ card number/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/CPT/)).not.toBeInTheDocument();
  });

  it("suggests the contracted rate, accepts '600,000', and sends the price-list row — never a member number or rate", async () => {
    renderForm();
    await chooseExcision();
    const estimate = screen.getByLabelText(/Estimated unit cost/) as HTMLInputElement;
    expect(estimate.value).toBe("270,000");
    fireEvent.change(estimate, { target: { value: "600,000" } });
    fireEvent.blur(estimate);
    fireEvent.change(screen.getByLabelText(/Clinical justification/), { target: { value: "More lesions found at review" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit amendment/ }));
    await waitFor(() => expect(amend.amendProviderPreauthAction).toHaveBeenCalledTimes(1));
    const arg = amend.amendProviderPreauthAction.mock.calls[0][0];
    expect(arg).toMatchObject({
      parentPreAuthId: "pa-parent",
      context: { purpose: "PREAUTH", memberRef: "mem-1", serviceDate: "2026-09-20", benefitCategory: "SURGICAL" },
      expectedContractVersionId: "ver-fh",
      lines: [{ selectedProviderTariffId: "t-exc", serviceCategory: "PROCEDURE", quantity: "1", billedUnitPrice: "600000" }],
      clinicalNotes: "More lesions found at review",
    });
    expect(JSON.stringify(arg)).not.toMatch(/TST-2026|Amani|270000|unitRate|cptCode/);
  });

  it("a refusal is shown in words and keeps everything typed", async () => {
    amend.amendProviderPreauthAction.mockResolvedValueOnce(mutationFail("VALIDATION", { message: "The amendment was not submitted. Correct the items listed.", fieldErrors: { "lines.0.service": ["This service is no longer on your price list for this date. Select the service again."] } }));
    renderForm();
    await chooseExcision();
    fireEvent.click(screen.getByRole("button", { name: /Submit amendment/ }));
    // The form's summary and the line's own message are both alerts.
    const summary = (await screen.findByText("The amendment was not submitted. Correct the items listed.")).closest("[role=alert]");
    expect(summary).not.toBeNull();
    expect(summary).toHaveTextContent("This service is no longer on your price list for this date.");
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Amani Testmember").length).toBeGreaterThan(0);
    expect((screen.getByLabelText(/Estimated unit cost/) as HTMLInputElement).value).toBe("270,000");
  });
});
