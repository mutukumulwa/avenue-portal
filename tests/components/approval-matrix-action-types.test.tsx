import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * F76-GAP-02 — the approval-matrix admin UI must offer AUTO_ADJ_POLICY_CHANGE,
 * otherwise the governing rule can't be created and a policy change can never be
 * submitted ("No approval matrix is configured…"). This guards the dropdown
 * option that unblocks the whole maker/checker flow.
 */

// Server actions are passed to the form only; stub them so importing the client
// component doesn't drag in prisma / next server deps.
vi.mock("@/app/(admin)/settings/approval-matrix/actions", () => ({
  createApprovalMatrixRuleAction: vi.fn(),
  toggleApprovalMatrixRuleAction: vi.fn(),
  deleteApprovalMatrixRuleAction: vi.fn(),
}));

import { ApprovalMatrixManager } from "@/app/(admin)/settings/approval-matrix/ApprovalMatrixManager";

describe("ApprovalMatrixManager — F76-GAP-02 action type", () => {
  it("offers AUTO_ADJ_POLICY_CHANGE in the Action Type dropdown so a governing rule can be created", () => {
    render(<ApprovalMatrixManager rules={[]} clients={[]} />);
    // The rule form is behind the "Add Approval Rule" toggle.
    fireEvent.click(screen.getByRole("button", { name: /Add Approval Rule/i }));
    const option = screen.getByRole("option", { name: /Auto-adjudication policy change/i }) as HTMLOptionElement;
    expect(option).toBeInTheDocument();
    expect(option.value).toBe("AUTO_ADJ_POLICY_CHANGE");
  });
});
