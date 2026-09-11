/**
 * Family Hospital UAT plan P04.03 — the rebuilt pre-authorisation form.
 * FH-10: "600,000" is accepted as 600000. The estimate is suggested from the
 * contracted rate but stays editable and is shown apart from it. A planned
 * date may be later than today. A refused request can be corrected and resent
 * (a new draft key), which the old form could not do.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const capture = vi.hoisted(() => ({ resolveCaseContextAction: vi.fn(), searchDiagnosesAction: vi.fn(), searchServiceCatalogAction: vi.fn() }));
vi.mock("@/app/provider/capture-actions", () => capture);
const submit = vi.hoisted(() => ({ submitProviderPreauthAction: vi.fn() }));
vi.mock("@/app/provider/preauth/new/actions", () => submit);

import { ProviderPreauthForm } from "@/app/provider/preauth/new/ProviderPreauthForm";
import { mutationFail } from "@/lib/mutation-contract";
import type { CaseContextDTO } from "@/lib/provider-capture-contract";

const DTO: CaseContextDTO = {
  memberRef: "mem-1", displayName: "Julius Mugerwa", maskedMemberNumber: "•••• 0001",
  eligibility: { eligible: true, reasonCode: "ELIGIBLE", message: "Covered on this date." }, schemeName: null, packageName: null,
  branch: { id: "br-main", name: "Main" }, contract: { id: "con-fh", number: "PC-2026-202", versionId: "ver-fh" }, currency: "UGX",
  serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT", catalogueEnabled: true,
  unlisted: { allowed: true, rule: "REFER_FOR_REVIEW", label: "Not in contracted tariff — manual review." },
};
const EXCISION = {
  tariffId: "t-exc", serviceName: "Excision of lesion (less than 5 lesions)", providerServiceCode: null, cptCode: null, category: "PROCEDURE", taxonomyName: "Theatre",
  unitRate: "270000", currency: "UGX", unitLabel: "per procedure", requiresPreauth: true, effectiveFrom: "2026-08-28", selectable: true, unavailableReason: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  capture.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
  capture.searchDiagnosesAction.mockResolvedValue({ ok: true, options: [{ code: "L72.0", description: "Epidermal cyst", category: "Diseases of the skin" }] });
  capture.searchServiceCatalogAction.mockResolvedValue({ ok: true, rows: [EXCISION], total: 1, hasMore: false, otherCategoryMatches: [] });
  submit.submitProviderPreauthAction.mockResolvedValue(undefined);
});

async function fillCase() {
  fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00001" } });
  fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
  await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
  fireEvent.change(screen.getByRole("combobox", { name: /Primary diagnosis/ }), { target: { value: "cyst" } });
  const dx = await screen.findByRole("listbox", { name: /Primary diagnosis/ });
  await waitFor(() => expect(within(dx).getAllByRole("option")).toHaveLength(1));
  fireEvent.click(within(dx).getByRole("option"));
  fireEvent.change(screen.getByRole("combobox", { name: /Line 1 service/ }), { target: { value: "excision" } });
  const svc = await screen.findByRole("listbox", { name: "Line 1 service" });
  await waitFor(() => expect(within(svc).getAllByRole("option")).toHaveLength(1));
  fireEvent.click(within(svc).getByRole("option"));
}

describe("ProviderPreauthForm", () => {
  it("defaults the expected date to the server's Kampala today, allows a later one, and has no CPT box", () => {
    render(<ProviderPreauthForm today="2026-09-11" />);
    const date = screen.getByLabelText(/Expected date of service/) as HTMLInputElement;
    expect(date.value).toBe("2026-09-11");
    expect(date).not.toHaveAttribute("max");
    expect(within(screen.getByLabelText(/^Benefit/)).getByRole("option", { name: "Surgical" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/CPT/)).not.toBeInTheDocument();
  });

  it("suggests the contracted rate as the estimate, keeps them apart, and accepts '600,000'", async () => {
    render(<ProviderPreauthForm today="2026-09-11" />);
    await fillCase();
    const estimate = screen.getByLabelText(/Estimated unit cost/) as HTMLInputElement;
    expect(estimate.value).toBe("270,000");
    fireEvent.change(estimate, { target: { value: "600,000" } });
    fireEvent.blur(estimate);
    const line = screen.getByRole("listitem", { name: "Line 1" });
    expect(within(line).getByText("Contracted rate").nextElementSibling).toHaveTextContent("UGX 270,000");
    expect(screen.getByText(/This service needs pre-authorisation under your contract/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Submit pre-authorisation/ }));
    await waitFor(() => expect(submit.submitProviderPreauthAction).toHaveBeenCalledTimes(1));
    expect(submit.submitProviderPreauthAction.mock.calls[0][0]).toMatchObject({
      context: { purpose: "PREAUTH", memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT" },
      expectedContractVersionId: "ver-fh",
      diagnosisCode: "L72.0",
      lines: [{ selectedProviderTariffId: "t-exc", serviceCategory: "PROCEDURE", quantity: "1", billedUnitPrice: "600000" }],
    });
  });

  it("after a refusal, the corrected request is sent under a new draft key", async () => {
    submit.submitProviderPreauthAction
      .mockResolvedValueOnce(mutationFail("VALIDATION", { message: "The pre-authorisation was not submitted. Correct the items listed.", fieldErrors: { benefitCategory: ["This benefit is not in the member's package"] } }))
      .mockResolvedValueOnce(undefined);
    render(<ProviderPreauthForm today="2026-09-11" />);
    await fillCase();
    fireEvent.click(screen.getByRole("button", { name: /Submit pre-authorisation/ }));
    const summary = await screen.findByRole("alert", { name: /with this form/ });
    expect(within(summary).getByRole("link", { name: /Benefit: This benefit is not in the member's package/ })).toHaveAttribute("href", "#pa-benefit");
    fireEvent.click(screen.getByRole("button", { name: /Submit pre-authorisation/ }));
    await waitFor(() => expect(submit.submitProviderPreauthAction).toHaveBeenCalledTimes(2));
    const [first, second] = submit.submitProviderPreauthAction.mock.calls.map((c) => c[0].idempotencyKey);
    expect(second).not.toBe(first);
  });
});
