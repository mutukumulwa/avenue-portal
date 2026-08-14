import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// The action is covered by its own tests; here we only assert the persona
// dropdown the operator actually sees.
vi.mock("@/app/(admin)/settings/actions", () => ({
  inviteUserAction: vi.fn(async () => ({ ok: true })),
}));

import { InviteUserModal } from "@/app/(admin)/settings/InviteUserModal";
import { PROVIDER_PERSONA_ROLE_CODES } from "@/../prisma/seeds/provider-rbac";

const providers = [
  { id: "p1", name: "Family Hospital", branches: [{ id: "b1", name: "Main" }] },
];

/** Open the modal and choose Provider (Facility) so the persona block renders. */
function openProviderInvite() {
  const view = render(<InviteUserModal providers={providers} />);
  fireEvent.click(screen.getByRole("button", { name: /invite user/i }));
  fireEvent.change(view.container.querySelector('select[name="role"]')!, {
    target: { value: "PROVIDER_USER" },
  });
  return view;
}

function personaOptions(container: HTMLElement) {
  const select = container.querySelector('select[name="providerRoleCode"]') as HTMLSelectElement;
  expect(select).toBeTruthy();
  return Array.from(select.options)
    .map((o) => o.value)
    .filter(Boolean); // drop the "Select provider role…" placeholder
}

beforeEach(() => vi.clearAllMocks());

describe("InviteUserModal — provider persona dropdown", () => {
  /**
   * The regression this guards: PROVIDER_FACILITY_ADMIN was seeded, granted all
   * 22 provider permissions and accepted by the server action, but was absent
   * from this literal list — so the one role a facility owner needs could not be
   * granted from the UI at all. Asserting against PROVIDER_PERSONA_ROLE_CODES
   * (the server's own allow-list) means the two can no longer drift apart.
   */
  it("offers exactly the personas the server will accept", () => {
    const { container } = openProviderInvite();
    expect(personaOptions(container).sort()).toEqual([...PROVIDER_PERSONA_ROLE_CODES].sort());
  });

  it("includes Facility Admin, labelled for an operator", () => {
    const { container } = openProviderInvite();
    const select = container.querySelector('select[name="providerRoleCode"]') as HTMLSelectElement;
    const facilityAdmin = Array.from(select.options).find((o) => o.value === "PROVIDER_FACILITY_ADMIN");
    expect(facilityAdmin?.textContent).toBe("Facility Admin");
  });

  it("never offers the deprecated legacy bundle", () => {
    const { container } = openProviderInvite();
    expect(personaOptions(container)).not.toContain("PROVIDER_LEGACY");
  });
});
