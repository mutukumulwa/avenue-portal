/**
 * Family Hospital UAT plan P04.01 — the rebuilt "File a claim" form.
 * §8.4 / P04.01 steps 2–5 and 7: the shared controls are on the page; services
 * wait for an eligible case; the form sends references and billed prices only;
 * a refused submit keeps every value and focuses a summary; a double click
 * files once; the draft key is renewed only when nothing was saved.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

const capture = vi.hoisted(() => ({ resolveCaseContextAction: vi.fn(), searchDiagnosesAction: vi.fn(), searchServiceCatalogAction: vi.fn() }));
vi.mock("@/app/provider/capture-actions", () => capture);
const submit = vi.hoisted(() => ({ submitProviderClaimAction: vi.fn() }));
vi.mock("@/app/provider/claims/new/actions", () => submit);

import { ProviderClaimForm } from "@/app/provider/claims/new/ProviderClaimForm";
import { mutationFail } from "@/lib/mutation-contract";
import type { CaseContextDTO } from "@/lib/provider-capture-contract";

const DTO: CaseContextDTO = {
  memberRef: "mem-1", displayName: "Julius Mugerwa", maskedMemberNumber: "•••• 0001",
  eligibility: { eligible: true, reasonCode: "ELIGIBLE", message: "Covered on this date." },
  schemeName: "Provider Onboarding Trial Scheme", packageName: "Medvex Premier", branch: { id: "br-main", name: "Main" },
  contract: { id: "con-fh", number: "PC-2026-202", versionId: "ver-fh" }, currency: "UGX",
  serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT", catalogueEnabled: true,
  unlisted: { allowed: true, rule: "REFER_FOR_REVIEW", label: "Not in contracted tariff — manual review." },
};
const FBC = {
  tariffId: "t-fbc", serviceName: "Full Blood Count", providerServiceCode: null, cptCode: null, category: "LABORATORY", taxonomyName: "Laboratory",
  unitRate: "25000", currency: "UGX", unitLabel: "per item", requiresPreauth: false, effectiveFrom: "2026-08-28", selectable: true, unavailableReason: null,
};

beforeEach(() => {
  // reset, not clear: a queued "once" reply must never leak into the next test.
  vi.resetAllMocks();
  capture.resolveCaseContextAction.mockResolvedValue({ outcome: "RESOLVED", context: DTO, correlationId: "c" });
  capture.searchDiagnosesAction.mockResolvedValue({ ok: true, options: [{ code: "B54", description: "Malaria, unspecified", category: "Certain infectious and parasitic diseases" }] });
  capture.searchServiceCatalogAction.mockResolvedValue({ ok: true, rows: [FBC], total: 1, hasMore: false, otherCategoryMatches: [] });
  submit.submitProviderClaimAction.mockResolvedValue(undefined);
});

async function findMember() {
  fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00001" } });
  fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
  await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
}

async function chooseDiagnosis() {
  fireEvent.change(screen.getByRole("combobox", { name: /Primary diagnosis/ }), { target: { value: "malaria" } });
  const list = await screen.findByRole("listbox", { name: /Primary diagnosis/ });
  await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(1));
  fireEvent.click(within(list).getByRole("option"));
}

async function chooseService() {
  fireEvent.change(screen.getByLabelText(/Line 1 category/), { target: { value: "LABORATORY" } });
  fireEvent.change(screen.getByRole("combobox", { name: /Line 1 service/ }), { target: { value: "blood" } });
  const list = await screen.findByRole("listbox", { name: "Line 1 service" });
  await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(1));
  fireEvent.click(within(list).getByRole("option"));
}

describe("ProviderClaimForm", () => {
  it("shows the server's Kampala date, the full benefit list, and no CPT box or global price", () => {
    render(<ProviderClaimForm today="2026-09-11" handoff={null} />);
    expect((screen.getByLabelText(/Date of service/) as HTMLInputElement).value).toBe("2026-09-11");
    expect(screen.getByLabelText(/Date of service/)).toHaveAttribute("max", "2026-09-11");
    const benefit = screen.getByLabelText(/^Benefit/);
    expect(within(benefit).getByRole("option", { name: "Inpatient" })).toBeInTheDocument();
    expect(within(benefit).getByRole("option", { name: "Surgical" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/CPT/)).not.toBeInTheDocument();
    expect(screen.getByText(/Find the member first/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Line 1 service/ })).toBeDisabled();
  });

  it("refuses to submit without a resolved member and a diagnosis — summary focused, action not called", async () => {
    render(<ProviderClaimForm today="2026-09-11" handoff={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Submit claim/ }));
    const summary = await screen.findByRole("alert", { name: /with this form/ });
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(within(summary).getByRole("link", { name: /Member: Find the member first\./ })).toHaveAttribute("href", "#claim-member");
    expect(within(summary).getByRole("link", { name: /Primary diagnosis: Choose the primary diagnosis\./ })).toHaveAttribute("href", "#claim-diagnosis");
    expect(submit.submitProviderClaimAction).not.toHaveBeenCalled();
  });

  it("sends references and billed prices only — the server derives the rest", async () => {
    render(<ProviderClaimForm today="2026-09-11" handoff={null} />);
    await findMember();
    await chooseDiagnosis();
    await chooseService();
    fireEvent.change(screen.getByLabelText(/Billed unit price/), { target: { value: "30,000" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit claim/ }));
    await waitFor(() => expect(submit.submitProviderClaimAction).toHaveBeenCalledTimes(1));
    const payload = submit.submitProviderClaimAction.mock.calls[0][0];
    expect(payload).toEqual({
      idempotencyKey: expect.stringMatching(/^op_/),
      context: { purpose: "CLAIM", memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-11", benefitCategory: "OUTPATIENT" },
      expectedContractVersionId: "ver-fh",
      serviceType: "OUTPATIENT",
      attendingDoctor: undefined,
      diagnosisCode: "B54",
      lines: [{ selectedProviderTariffId: "t-fbc", serviceCategory: "LABORATORY", description: undefined, quantity: "1", billedUnitPrice: "30000" }],
    });
    expect(JSON.stringify(payload)).not.toMatch(/MTC-2026-00001|Julius|25000|UGX/);
  });

  it("keeps every value after a refusal, links line errors, and renews the key only when nothing was saved", async () => {
    submit.submitProviderClaimAction
      .mockResolvedValueOnce(mutationFail("VALIDATION", { message: "The claim was not submitted. Correct the items listed.", fieldErrors: { "lines.0.service": ["This service is no longer on your price list for this date. Select the service again."] } }))
      .mockResolvedValueOnce(mutationFail("UNKNOWN_OUTCOME", { message: "We could not confirm whether the claim was received." }))
      .mockResolvedValueOnce(undefined);
    render(<ProviderClaimForm today="2026-09-11" handoff={null} />);
    await findMember();
    await chooseDiagnosis();
    await chooseService();

    fireEvent.click(screen.getByRole("button", { name: /Submit claim/ }));
    const summary = await screen.findByRole("alert", { name: /with this form/ });
    expect(within(summary).getByRole("link", { name: /Line 1 service: This service is no longer/ })).toHaveAttribute("href", expect.stringMatching(/^#line-first-svc$/));
    // Nothing typed was lost.
    expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument();
    expect(screen.getByText("B54")).toBeInTheDocument();
    expect(screen.getByText("Full Blood Count")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Submit claim/ }));
    await waitFor(() => expect(submit.submitProviderClaimAction).toHaveBeenCalledTimes(2));
    await screen.findByText(/We could not confirm whether this was saved/);
    fireEvent.click(screen.getByRole("button", { name: /Submit claim/ }));
    await waitFor(() => expect(submit.submitProviderClaimAction).toHaveBeenCalledTimes(3));

    const keys = submit.submitProviderClaimAction.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[1]).not.toBe(keys[0]); // VALIDATION saved nothing → a fresh key
    expect(keys[2]).toBe(keys[1]); // UNKNOWN_OUTCOME → same key, so a retry replays
  });

  it("a double click files once", async () => {
    let release!: () => void;
    submit.submitProviderClaimAction.mockImplementation(() => new Promise<void>((r) => { release = () => r(); }));
    render(<ProviderClaimForm today="2026-09-11" handoff={null} />);
    await findMember();
    await chooseDiagnosis();
    await chooseService();
    const button = screen.getByRole("button", { name: /Submit claim/ });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: /Submitting/ })).toBeDisabled());
    expect(submit.submitProviderClaimAction).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it("an ineligible member is shown, but services and submission stay closed", async () => {
    capture.resolveCaseContextAction.mockResolvedValue({
      outcome: "INELIGIBLE",
      context: { ...DTO, eligibility: { eligible: false, reasonCode: "LAPSED", message: "Cover lapsed before this date." } },
      message: "Cover lapsed before this date.",
      correlationId: "c",
    });
    render(<ProviderClaimForm today="2026-09-11" handoff={null} />);
    fireEvent.change(screen.getByLabelText(/Member \/ card number/), { target: { value: "MTC-2026-00005" } });
    fireEvent.click(screen.getByRole("button", { name: /Find member/ }));
    await waitFor(() => expect(screen.getByText("Not eligible on this date")).toBeInTheDocument());
    expect(screen.getByText(/not eligible on this date, so services cannot be added/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Line 1 service/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Submit claim/ }));
    expect(submit.submitProviderClaimAction).not.toHaveBeenCalled();
  });

  it("an eligibility hand-off resolves on arrival with its own date and benefit", async () => {
    render(<ProviderClaimForm today="2026-09-11" handoff={{ memberRef: "mem-1", branchId: "br-main", serviceDate: "2026-09-10", benefitCategory: "INPATIENT" }} />);
    await waitFor(() => expect(screen.getByText("Julius Mugerwa")).toBeInTheDocument());
    expect(capture.resolveCaseContextAction).toHaveBeenCalledWith(expect.objectContaining({ purpose: "CLAIM", memberRef: "mem-1", serviceDate: "2026-09-10", benefitCategory: "INPATIENT" }));
    expect((screen.getByLabelText(/Date of service/) as HTMLInputElement).value).toBe("2026-09-10");
  });
});
