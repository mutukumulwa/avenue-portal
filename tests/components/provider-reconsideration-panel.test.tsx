/**
 * F5.13 — the reconsideration status panel renders ONLY the F5.11 safe provider projection,
 * so no internal field can reach the provider (the projection has none by construction).
 */
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { ReconsiderationPanel } from "@/app/provider/claims/[id]/ReconsiderationPanel";
import type { ProviderReconsiderationView } from "@/server/services/claim-reconsideration/policy";

const view: ProviderReconsiderationView = {
  id: "r1",
  status: "UNDER_REVIEW",
  reasonCode: "UNDERPAID_RATE",
  providerNarrative: "The contracted rate is 900.",
  requestedAmount: "300.00",
  currency: "UGX",
  filingDeadline: new Date("2026-08-30T00:00:00Z"),
  filedAt: new Date("2026-07-05T00:00:00Z"),
  dueAt: new Date("2026-07-08T00:00:00Z"),
  outcomeReasonCode: null,
  outcomeSafeExplanation: null,
};

describe("F5.13 ReconsiderationPanel", () => {
  it("renders the safe status, requested amount, and the provider's own submission", () => {
    render(<ReconsiderationPanel view={view} currency="UGX" />);
    expect(screen.getByText(/under review/i)).toBeInTheDocument();
    expect(screen.getByText(/UGX 300\.00/)).toBeInTheDocument();
    expect(screen.getByText(/The contracted rate is 900/)).toBeInTheDocument();
  });

  it("cannot leak internal data — the projection carries none", () => {
    const { container } = render(<ReconsiderationPanel view={view} currency="UGX" />);
    // the panel only ever renders view.* — and the projection type has no adjudicator/internal/reviewer field
    expect(container.textContent).not.toMatch(/adjudicator|internal|reviewer|integrity team/i);
    // @ts-expect-error — the projection type has no originalAdjudicatorId to render
    expect(view.originalAdjudicatorId).toBeUndefined();
  });
});
