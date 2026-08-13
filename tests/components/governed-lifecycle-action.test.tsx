/**
 * UAT-HF P07.03 acceptance — "Enter in a reason/date field cannot trigger
 * transition; cancel changes nothing; confirm creates one event and clear
 * receipt."
 *
 * DEF-059: '"Lapse Manually" moved a member ACTIVE to LAPSED immediately on
 * click: no browser dialog fired, no in-product confirmation appeared, no reason
 * was captured ... So the governance exists in the product and is simply not
 * applied to the two reversible actions that change live cover — the ones an
 * operator is most likely to click by accident.'
 * DEF-040: the same shape on "Standard Cancel".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { GovernedLifecycleAction } from "@/components/members/GovernedLifecycleAction";

const action = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom does not implement form submission; the component calls
  // requestSubmit(), so stand that in and observe it.
  HTMLFormElement.prototype.requestSubmit = vi.fn(function (this: HTMLFormElement) {
    action(new FormData(this));
  });
});

const renderAction = (props: Partial<React.ComponentProps<typeof GovernedLifecycleAction>> = {}) =>
  render(
    <GovernedLifecycleAction
      action={action}
      memberId="m1"
      memberLabel="UX26-2026-00030 — Amina Nabirye Kato"
      label="Lapse Manually"
      title="Lapse this membership?"
      confirmLabel="Lapse the membership"
      consequences={<p>Cover stops now.</p>}
      {...props}
    />,
  );

describe("P07.03 a cover-changing action is never one click", () => {
  it("the first click opens a confirmation instead of acting", () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Lapse Manually" }));

    // The run: "status changes immediately, nothing is asked".
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("names the member being acted on", () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Lapse Manually" }));
    // Never "are you sure?" about an unnamed thing.
    expect(screen.getByRole("dialog")).toHaveTextContent("UX26-2026-00030 — Amina Nabirye Kato");
  });

  it("spells out the consequence", () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Lapse Manually" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Cover stops now.");
  });

  it("asks for a reason, which the run found was never captured", () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Lapse Manually" }));
    const reason = screen.getByLabelText(/Reason \(recorded in the audit trail\)/i);
    expect(reason).toBeRequired();
  });

  it("cancel changes nothing", () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Lapse Manually" }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirm submits once, carrying the member and the reason", () => {
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Lapse Manually" }));
    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: "Non-payment confirmed with finance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lapse the membership" }));

    expect(action).toHaveBeenCalledTimes(1);
    const submitted = action.mock.calls[0][0] as FormData;
    expect(submitted.get("memberId")).toBe("m1");
    expect(submitted.get("reason")).toBe("Non-payment confirmed with finance");
  });
});

describe("P07.03 Enter cannot trigger the transition", () => {
  it("the reason field is not inside a form with a default submit target", () => {
    // The acceptance's hardest clause. The only route to submit is the confirm
    // button, which calls requestSubmit() explicitly.
    renderAction();
    fireEvent.click(screen.getByRole("button", { name: "Lapse Manually" }));

    const reason = screen.getByLabelText(/Reason/i);
    fireEvent.keyDown(reason, { key: "Enter", code: "Enter" });
    fireEvent.submit(reason);

    expect(action).not.toHaveBeenCalled();
  });

  it("extra inputs are inside the dialog, not loose on the page", () => {
    renderAction({
      children: (
        <label>
          Last covered day
          <input name="effectiveDate" type="date" />
        </label>
      ),
    });
    fireEvent.click(screen.getByRole("button", { name: "Lapse Manually" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Last covered day");
  });
});

describe("P07.03 the page's one-click forms are gone", () => {
  const page = readFileSync("src/app/(admin)/members/[id]/page.tsx", "utf8");

  it.each([
    ["lapseManuallyAction", "Lapse Manually"],
    ["reinstateWithinCatchupAction", "Reinstate"],
    ["initiateStandardCancellationAction", "Standard Cancel"],
    ["initiateCoolingOffCancellationAction", "Cooling-Off Cancel"],
  ])("%s no longer sits on a bare <form>", (actionName) => {
    // A bare `<form action={x}>` with a submit button IS the one-click pattern.
    expect(page).not.toMatch(new RegExp(`<form action=\\{${actionName}\\}`));
    expect(page).toContain(`action={${actionName}}`); // still wired, via the guard
  });

  it("the irreversible cancellation requires typing the member number", () => {
    expect(page).toContain("requiredPhrase={member.memberNumber}");
  });
});

describe("P07.03 the server refuses an unreasoned change", () => {
  const actions = readFileSync("src/app/(admin)/members/[id]/lifecycle-actions.ts", "utf8");

  it("requires a reason on every cover-changing action", () => {
    // A dialog that asks for a reason and then discards it is worse than not
    // asking, so the server insists too — which also holds for a forged POST.
    for (const fn of [
      "lapseManuallyAction",
      "reinstateWithinCatchupAction",
      "initiateCoolingOffCancellationAction",
      "initiateStandardCancellationAction",
    ]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(body.slice(0, 700), fn).toContain("requireReason(formData)");
    }
  });

  it("refuses rather than defaulting to a placeholder", () => {
    // A lifecycle change with an invented reason is an audit trail that reads
    // as complete and is not.
    expect(actions).toMatch(/throw new Error\(\s*"A reason is required/);
  });

  it("records the reason in the audit trail", () => {
    expect(actions).toContain("auditLifecycleReason");
    expect(actions).toMatch(/metadata: \{ memberId: input\.memberId, reason \}/);
  });
});

/**
 * UAT-HF P07.03 — the capability gap P05.05 opened, and logged, is closed.
 *
 * P05.05 removed `status` from the generic profile edit form (DEF-041/DEF-043:
 * suspending a member carried the ceremony of fixing a typo) and recorded that
 * `lifecycleService` has governed flows for lapse, reinstate, cancel and
 * terminate but NONE for suspend — so deleting the dropdown left no route to
 * suspend until a confirmation surface existed.
 */
describe("P07.03 suspend has a governed route again", () => {
  const page = readFileSync("src/app/(admin)/members/[id]/page.tsx", "utf8");
  const actions = readFileSync("src/app/(admin)/members/[id]/lifecycle-actions.ts", "utf8");

  it("an ACTIVE member can be suspended, with the same ceremony as its neighbours", () => {
    expect(page).toContain("action={suspendMemberAction}");
    expect(page).toMatch(/label="Suspend"/);
  });

  it("a SUSPENDED member has a route back", () => {
    // Otherwise suspending is a one-way door with no governed exit.
    expect(page).toContain("action={unsuspendMemberAction}");
    expect(page).toMatch(/member\.status === "SUSPENDED"/);
  });

  it("both require a reason, like every other cover-changing action", () => {
    for (const fn of ["suspendMemberAction", "unsuspendMemberAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      expect(body.slice(0, 700), fn).toContain("requireReason(formData)");
    }
  });

  it("goes through changeStatus, so the coverage gap is recorded", () => {
    // Suspending closes the open coverage period and un-suspending opens a
    // fresh one, which is what keeps point-in-time eligibility right.
    expect(actions).toContain("MembersService.changeStatus");
  });

  it("says the suspended window stays an uncovered gap", () => {
    // An operator who thinks lifting a suspension backfills cover will make
    // promises the claims engine will not honour.
    expect(page).toMatch(/uncovered gap in their history/);
  });
});
