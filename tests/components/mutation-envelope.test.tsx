/**
 * UAT-HF P01.01 acceptance — "validation, conflict, server unavailable, and
 * dropped-response tests render distinct states without losing inputs or
 * crashing the tree."
 *
 * The dropped-response case is DEF-065 itself. Before this hook, a Server Action
 * whose request never completed left `useActionState` holding a rejected promise;
 * React propagated it to the nearest error boundary and unmounted the form,
 * destroying every typed value — while the write may already have committed.
 *
 * So the test wraps the form in a real error boundary and asserts the boundary
 * NEVER renders. If the rejection escapes, the fallback appears and the test fails.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { useMutationAction } from "@/components/forms/useMutationAction";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { MutationOutcome } from "@/components/forms/MutationOutcome";
import { OPERATION_ID_FIELD, mutationFail, mutationOk, type MutationResult } from "@/lib/mutation-contract";

/** Renders its fallback only if an error escapes the subtree. */
class Boundary extends React.Component<{ children: React.ReactNode }, { crashed: boolean }> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  render() {
    return this.state.crashed ? <p>BOUNDARY CAUGHT A CRASH</p> : this.props.children;
  }
}

function Harness({ action }: { action: (p: MutationResult<void> | null, f: FormData) => Promise<MutationResult<void>> }) {
  const { state, formAction, values, operationId } = useMutationAction<void>(action);
  return (
    <div>
      <ErrorSummary failure={state && !state.ok ? state : null} fieldLabels={{ fullName: "Full name" }} />
      <MutationOutcome result={state} checkHref="/members/imports" />
      <form
        action={formAction}
        onSubmit={(e) => {
          // jsdom does not implement form submission; drive the action directly.
          e.preventDefault();
          const fd = new FormData();
          fd.set("fullName", (e.currentTarget.elements.namedItem("fullName") as HTMLInputElement).value);
          formAction(fd);
        }}
      >
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" name="fullName" defaultValue="" />
        <button type="submit">Save</button>
      </form>
      <output data-testid="restored">{values.fullName ?? ""}</output>
      <output data-testid="opid">{operationId}</output>
    </div>
  );
}

async function submit(value = "Amina Nabirye Kato") {
  const input = screen.getByLabelText("Full name") as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest("form")!);
}

describe("P01.01 mutation envelope — end to end through the hook", () => {
  it("a DROPPED RESPONSE does not crash the tree, keeps the input, and reports UNKNOWN_OUTCOME", async () => {
    // A rejected promise is exactly what a network drop mid-submit produces.
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <Boundary>
        <Harness action={action} />
      </Boundary>,
    );

    await submit();

    await waitFor(() => {
      expect(screen.getByText(/could not confirm whether this was saved/i)).toBeTruthy();
    });

    // The tree survived.
    expect(screen.queryByText("BOUNDARY CAUGHT A CRASH")).toBeNull();
    // The typed value is still available to re-render the form.
    expect(screen.getByTestId("restored").textContent).toBe("Amina Nabirye Kato");
    // And it explicitly tells the user NOT to resubmit.
    expect(screen.getByText(/do not submit it again/i)).toBeTruthy();
  });

  it("sends a stable operation id with every attempt, so a double-submit is a replay", async () => {
    const seen: string[] = [];
    const action = vi.fn(async (_p: MutationResult<void> | null, fd: FormData) => {
      seen.push(String(fd.get(OPERATION_ID_FIELD)));
      return mutationFail("UNAVAILABLE");
    });
    render(<Harness action={action} />);

    await submit("first");
    await waitFor(() => expect(seen).toHaveLength(1));
    await submit("second");
    await waitFor(() => expect(seen).toHaveLength(2));

    expect(seen[0]).toBeTruthy();
    expect(seen[0]).toBe(seen[1]); // same draft ⇒ same intent
    expect(screen.getByTestId("opid").textContent).toBe(seen[0]);
  });

  it("VALIDATION renders field errors in the summary and NOT as a banner", async () => {
    const action = vi.fn(async () =>
      mutationFail("VALIDATION", { message: "Check the form.", fieldErrors: { fullName: ["Enter a full name"] } }),
    );
    render(<Harness action={action} />);
    await submit("");

    await waitFor(() => expect(screen.getByText(/there is 1 problem with this form/i)).toBeTruthy());
    // Linked to the field it belongs to.
    const link = screen.getByRole("link", { name: /Full name: Enter a full name/i });
    expect(link.getAttribute("href")).toBe("#fullName");
    // Validation is the user's to fix — no support reference, no duplicate banner.
    expect(screen.queryByText(/quote this if you contact support/i)).toBeNull();
  });

  it.each([
    ["CONFLICT", /changed while you were working/i],
    ["UNAVAILABLE", /temporarily unavailable/i],
    ["FORBIDDEN", /do not have permission/i],
  ] as const)("%s renders its own distinct state", async (kind, pattern) => {
    const action = vi.fn(async () => mutationFail(kind));
    render(<Harness action={action} />);
    await submit();

    await waitFor(() => expect(screen.getByText(pattern)).toBeTruthy());
    // Every non-validation failure is quotable to support (DEF-070).
    expect(screen.getByText(/quote this if you contact support/i)).toBeTruthy();
  });

  it("success names a reference so the user can quote it (DEF-075)", async () => {
    const action = vi.fn(async () => mutationOk<void>("op_x", { entityRef: "UX26-2026-00017" }));
    render(<Harness action={action} />);
    await submit();

    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy());
    expect(screen.getByText("UX26-2026-00017")).toBeTruthy();
  });

  it("a replay says 'already saved' rather than claiming a second write", async () => {
    const action = vi.fn(async () => mutationOk<void>("op_x", { replayed: true, entityRef: "UX26-2026-00017" }));
    render(<Harness action={action} />);
    await submit();

    await waitFor(() => expect(screen.getByText("Already saved")).toBeTruthy());
    expect(screen.getByText(/nothing was duplicated/i)).toBeTruthy();
  });

  it("moves focus to the error summary so the failure is perceivable without sight", async () => {
    const action = vi.fn(async () => mutationFail("VALIDATION", { fieldErrors: { fullName: ["Required"] } }));
    render(<Harness action={action} />);
    await submit("");

    await waitFor(() => {
      expect(document.activeElement?.getAttribute("role")).toBe("alert");
    });
  });
});
