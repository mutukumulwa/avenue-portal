/**
 * UAT-HF P04.02 — the enrolment form, on the screen all three defects name.
 *
 * DEF-008: "The form exposes exactly one action, 'Register Member'. A search of
 * every visible control found no Cancel, Discard or Back control anywhere on the
 * form ... clicking the visible 'Members' breadcrumb navigated away immediately
 * with NO unsaved-change warning."
 * DEF-071: closing the tab and reopening produced empty fields "with no restore
 * or resume banner and no statement that anything was lost".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/members/new" }));

const mutationState = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/components/forms/useMutationAction", () => ({
  useMutationAction: () => ({
    state: mutationState.current,
    formAction: vi.fn(),
    pending: false,
    operationId: "op_test",
  }),
}));

vi.mock("@/components/layouts/SessionExpiryGuard", () => ({
  SessionExpiryGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The server action would drag next-auth (and `next/server`) into jsdom; the
// submit path itself is covered by tests/actions/member-enrolment-idempotency.
vi.mock("@/app/(admin)/members/new/actions", () => ({ addMemberAction: vi.fn() }));

import { MemberNewForm } from "@/app/(admin)/members/new/MemberNewForm";
import { DraftStore, MEMBER_ENROLMENT_DRAFT } from "@/lib/draft-store";

const SCOPE = { tenantId: "t1", userId: "alice" };
const GROUPS = [{ id: "g1", name: "Staff" }];

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mutationState.current = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

const renderForm = () => render(<MemberNewForm groups={GROUPS} draftScope={SCOPE} />);

describe("P04.02 DEF-008 — the form has a way out", () => {
  it("exposes a Cancel control, which the run found missing entirely", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("Cancel on a clean form leaves without nagging", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(confirm).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/members");
    confirm.mockRestore();
  });

  it("Cancel on a DIRTY form asks first, and staying keeps the typed value", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderForm();

    const firstName = screen.getByPlaceholderText("e.g. John");
    fireEvent.change(firstName, { target: { value: "UXDISPOSABLE" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(confirm).toHaveBeenCalled();
    // The run's exact loss: eight filled fields, gone with no prompt.
    expect(push).not.toHaveBeenCalled();
    expect(firstName).toHaveValue("UXDISPOSABLE");
    confirm.mockRestore();
  });

  it("accepting the warning discards the draft as well as leaving", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("e.g. John"), { target: { value: "UXDISPOSABLE" } });
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(push).toHaveBeenCalledWith("/members");
    expect(DraftStore.load(SCOPE, MEMBER_ENROLMENT_DRAFT)).toBeNull();
    confirm.mockRestore();
  });
});

describe("P04.02 DEF-071 — the draft is kept and offered back", () => {
  it("keeps typed input on this device as the operator works", async () => {
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("e.g. John"), { target: { value: "Amina" } });
    // Nothing is written until typing pauses.
    expect(DraftStore.load(SCOPE, MEMBER_ENROLMENT_DRAFT)).toBeNull();

    act(() => { vi.advanceTimersByTime(1000); });

    const saved = DraftStore.load(SCOPE, MEMBER_ENROLMENT_DRAFT);
    expect(saved?.values.firstName).toBe("Amina");
  });

  it("says the draft is on this device and NOT submitted", async () => {
    renderForm();

    fireEvent.change(screen.getByPlaceholderText("e.g. John"), { target: { value: "Amina" } });
    act(() => { vi.advanceTimersByTime(1000); });

    // "Draft saved" alone reads as "submitted" — the wording must foreclose it.
    await waitFor(() => {
      expect(screen.getByText(/kept on this device/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/not submitted/i)).toBeInTheDocument();
  });

  it("offers a labelled draft with its timestamp when the form reopens", async () => {
    DraftStore.save(SCOPE, MEMBER_ENROLMENT_DRAFT, { firstName: "Amina", lastName: "Kato" });
    renderForm();

    const banner = await screen.findByRole("region", { name: /unsaved draft/i });
    expect(banner).toHaveTextContent(/Unsaved draft from/i);
    expect(banner).toHaveTextContent(/EAT/);
    expect(banner).toHaveTextContent(/Nothing has been submitted/i);
  });

  it("does NOT silently repopulate — the fields stay empty until asked", async () => {
    DraftStore.save(SCOPE, MEMBER_ENROLMENT_DRAFT, { firstName: "Amina" });
    renderForm();

    await screen.findByRole("region", { name: /unsaved draft/i });
    // A restored value the operator did not ask for is indistinguishable from
    // one they typed, and a stale draft would quietly become this enrolment.
    expect(screen.getByPlaceholderText("e.g. John")).toHaveValue("");
  });

  it("Restore fills the form, and the banner goes away", async () => {
    DraftStore.save(SCOPE, MEMBER_ENROLMENT_DRAFT, { firstName: "Amina", lastName: "Kato" });
    renderForm();

    await screen.findByRole("region", { name: /unsaved draft/i });
    fireEvent.click(screen.getByRole("button", { name: /restore draft/i }));

    expect(screen.getByPlaceholderText("e.g. John")).toHaveValue("Amina");
    expect(screen.getByPlaceholderText("e.g. Doe")).toHaveValue("Kato");
    expect(screen.queryByRole("region", { name: /unsaved draft/i })).not.toBeInTheDocument();
  });

  it("Discard deletes it, so it is not offered again", async () => {
    DraftStore.save(SCOPE, MEMBER_ENROLMENT_DRAFT, { firstName: "Amina" });
    renderForm();

    await screen.findByRole("region", { name: /unsaved draft/i });
    fireEvent.click(screen.getByRole("button", { name: /discard draft/i }));

    expect(screen.queryByRole("region", { name: /unsaved draft/i })).not.toBeInTheDocument();
    expect(DraftStore.load(SCOPE, MEMBER_ENROLMENT_DRAFT)).toBeNull();
  });

  it("shows no banner when there is no draft", () => {
    renderForm();
    expect(screen.queryByRole("region", { name: /unsaved draft/i })).not.toBeInTheDocument();
  });

  it("a successful enrolment purges the draft", async () => {
    DraftStore.save(SCOPE, MEMBER_ENROLMENT_DRAFT, { firstName: "Amina" });
    mutationState.current = {
      ok: true,
      data: { memberNumber: "UX26-2026-00017", memberId: "m1", warnings: [] },
    };
    renderForm();

    await waitFor(() => {
      expect(DraftStore.load(SCOPE, MEMBER_ENROLMENT_DRAFT)).toBeNull();
    });
    // Otherwise the next enrolment is offered the last member's details.
    expect(screen.queryByRole("region", { name: /unsaved draft/i })).not.toBeInTheDocument();
  });

  it("a second operator at the same desk is offered nothing", async () => {
    DraftStore.save(SCOPE, MEMBER_ENROLMENT_DRAFT, { firstName: "Amina", idNumber: "CM12345678" });
    render(<MemberNewForm groups={GROUPS} draftScope={{ tenantId: "t1", userId: "bob" }} />);

    // Give the mount effect a chance to have done the wrong thing.
    await waitFor(() => expect(screen.getByPlaceholderText("e.g. John")).toBeInTheDocument());
    expect(screen.queryByRole("region", { name: /unsaved draft/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/CM12345678/)).not.toBeInTheDocument();
  });

  it("keeps no draft at all when there is no scope to key it to", async () => {
    render(<MemberNewForm groups={GROUPS} draftScope={null} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. John"), { target: { value: "Amina" } });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
});

describe("P04.02 the form warns before the tab closes", () => {
  it("arms beforeunload only once something has been typed", async () => {
    renderForm();

    // Clean: leaving is not obstructed.
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("e.g. John"), { target: { value: "A" } });

    await waitFor(() => {
      const dirty = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(dirty);
      expect(dirty.defaultPrevented).toBe(true);
    });
  });
});

describe("P04.02 locale", () => {
  it("the phone placeholder is Ugandan, not Kenyan", () => {
    renderForm();
    const phone = screen.getByPlaceholderText(/^\+256/);
    expect(phone).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/\+254/)).not.toBeInTheDocument();
  });
});

describe("P04.02 a select restores too, not only text inputs", () => {
  it("restores the gender select", async () => {
    DraftStore.save(SCOPE, MEMBER_ENROLMENT_DRAFT, { firstName: "Amina", gender: "FEMALE" });
    renderForm();

    await screen.findByRole("region", { name: /unsaved draft/i });
    fireEvent.click(screen.getByRole("button", { name: /restore draft/i }));

    // Gender defaults to MALE; a draft that cannot restore a select would leave
    // the wrong value sitting in a required field.
    const selects = screen.getAllByRole("combobox");
    const gender = selects.find((s) => (s as HTMLSelectElement).name === "gender");
    expect((gender as HTMLSelectElement).value).toBe("FEMALE");
  });

  it("captures a select change, not only typing", async () => {
    renderForm();
    const selects = screen.getAllByRole("combobox");
    const gender = selects.find((s) => (s as HTMLSelectElement).name === "gender") as HTMLSelectElement;

    fireEvent.change(gender, { target: { value: "OTHER" } });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(DraftStore.load(SCOPE, MEMBER_ENROLMENT_DRAFT)?.values.gender).toBe("OTHER");
  });
});

/**
 * UAT-HF P05.03 — DEF-031 (S2).
 *
 * "Selecting Relationship 'Child' (or Spouse/Parent/Sibling) presents no
 * principal selector at all — the fields are identical to a principal
 * enrolment. Submitting creates a live ACTIVE dependant with no principal, no
 * family unit and its own full Annual Limit of UGX 25,000,000, with no warning
 * at any point. Three such orphaned CHILD members were created during this run."
 */
describe("P05.03 DEF-031 — the generic form cannot orphan a dependant", () => {
  const relationshipSelect = () =>
    screen.getAllByRole("combobox").find((s) => (s as HTMLSelectElement).name === "relationship") as
      | HTMLSelectElement
      | undefined;

  it("offers only Principal when no principal is in context", () => {
    renderForm();
    const options = Array.from(relationshipSelect()!.options).map((o) => o.value);
    // The four that silently created orphans.
    expect(options).toEqual(["PRINCIPAL"]);
  });

  it("says where dependants are actually added", () => {
    // A removed option with no explanation is its own defect.
    renderForm();
    expect(screen.getByText(/Add Dependent/)).toBeInTheDocument();
    expect(screen.getByText(/share its limits/i)).toBeInTheDocument();
  });

  it("offers the dependant relationships when a principal IS in context", () => {
    render(
      <MemberNewForm
        groups={GROUPS}
        draftScope={SCOPE}
        principal={{
          id: "p1",
          name: "Valid Principal",
          memberNumber: "UX26-2026-00030",
          groupId: "g1",
          groupName: "Staff",
        }}
      />,
    );
    const options = Array.from(relationshipSelect()!.options).map((o) => o.value);
    expect(options).toEqual(["SPOUSE", "CHILD", "PARENT", "SIBLING"]);
    expect(options).not.toContain("PRINCIPAL");
  });
});
