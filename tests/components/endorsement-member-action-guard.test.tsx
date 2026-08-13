import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitEndorsementAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(admin)/endorsements/new/actions", () => ({ submitEndorsementAction }));

import { EndorsementForm } from "@/app/(admin)/endorsements/new/EndorsementForm";

const props = {
  groups: [
    {
      id: "g1",
      name: "Test Group",
      contributionRate: 365_000,
      renewalDate: "2027-01-01T00:00:00.000Z",
    },
  ],
  packages: [],
  members: [{ id: "m1", name: "Member One", groupId: "g1", relationship: "PRINCIPAL" }],
  preselectedGroupId: "g1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("P07.06 endorsement refusal is visible and recoverable", () => {
  it("shows the server's current-status reason and re-enables submit", async () => {
    submitEndorsementAction.mockResolvedValue({
      ok: false,
      error:
        "New Endorsement is not available while this membership is lapsed. Reinstate within the catch-up window.",
    });
    const { container } = render(<EndorsementForm {...props} />);

    fireEvent.change(container.querySelector('select[name="type"]')!, {
      target: { value: "MEMBER_DELETION" },
    });
    fireEvent.change(container.querySelector('input[name="effectiveDate"]')!, {
      target: { value: "2026-08-13" },
    });
    await waitFor(() => expect(container.querySelector('select[name="memberId"]')).not.toBeNull());
    fireEvent.change(container.querySelector('select[name="memberId"]')!, {
      target: { value: "m1" },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(/membership is lapsed/i);
    expect(screen.getByRole("button", { name: /submit for review/i })).not.toBeDisabled();
    expect(container.querySelector('select[name="memberId"]')).toHaveValue("m1");
  });

  it("keeps the entered form on screen when the transport rejects", async () => {
    submitEndorsementAction.mockRejectedValue(new Error("network down"));
    const { container } = render(<EndorsementForm {...props} />);
    fireEvent.change(container.querySelector('input[name="effectiveDate"]')!, {
      target: { value: "2026-08-13" },
    });
    fireEvent.submit(container.querySelector("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(/entries are still on this page/i);
    expect(container.querySelector('input[name="effectiveDate"]')).toHaveValue("2026-08-13");
  });
});
