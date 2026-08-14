/**
 * DEF-001 — the signed-in actor (account name + effective persona) must be
 * evidenceable on-screen in EVERY portal shell, via the one shared
 * SignedInIdentity block. Before this, only the admin shell showed it, so a
 * reviewer could not tell WHO performed an action in the HR, provider, member or
 * fund portals.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { HRSidebar } from "@/components/layouts/HRSidebar";
import { FundSidebar } from "@/components/layouts/FundSidebar";
import { ProviderNav } from "@/components/layouts/ProviderNav";
import { MemberNav } from "@/components/layouts/MemberNav";
import { BrokerSidebar } from "@/components/layouts/BrokerSidebar";
import { SignedInIdentity } from "@/components/layouts/SignedInIdentity";
import {
  PROVIDER_ROLE_LABELS,
  resolveProviderPersonaLabel,
} from "@/components/layouts/provider-nav-model";

beforeEach(() => vi.clearAllMocks());

const NAME = "Jane Doe";

describe("DEF-001 — signed-in identity in every portal shell", () => {
  it("HRSidebar shows the actor name and the mapped role label", () => {
    render(<HRSidebar groupName="Acme Group" userRole="HR_MANAGER" userName={NAME} />);
    expect(screen.getAllByLabelText("Signed-in user").length).toBeGreaterThan(0);
    expect(screen.getAllByText(NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText("HR Manager").length).toBeGreaterThan(0);
  });

  it("FundSidebar shows the actor name and the mapped role label", () => {
    render(<FundSidebar schemes={[]} userRole="FUND_ADMINISTRATOR" userName={NAME} />);
    expect(screen.getAllByLabelText("Signed-in user").length).toBeGreaterThan(0);
    expect(screen.getAllByText(NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fund Administrator").length).toBeGreaterThan(0);
  });

  it("ProviderNav falls back to the generic Provider persona when no persona role is resolved (prod pre-seed / D-20)", () => {
    render(<ProviderNav providerName="Nakasero Hospital" items={[]} actorName={NAME} />);
    expect(screen.getAllByLabelText("Signed-in user").length).toBeGreaterThan(0);
    expect(screen.getAllByText(NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Provider").length).toBeGreaterThan(0);
  });

  it("DEF-002: ProviderNav shows the REAL persona label when one is threaded in (not the generic 'Provider')", () => {
    render(
      <ProviderNav providerName="Nakasero Hospital" items={[]} actorName={NAME} roleLabel="Biller" />,
    );
    expect(screen.getAllByText(NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Biller").length).toBeGreaterThan(0);
    // The generic label must be gone once a persona is known.
    expect(screen.queryByText("Provider")).toBeNull();
  });

  it("DEF-002: each of the six provider personas renders its own label end-to-end", () => {
    const personas: [string, string][] = [
      ["PROVIDER_FRONT_DESK", "Front Desk"],
      ["PROVIDER_CLINICIAN", "Clinician"],
      ["PROVIDER_BILLER", "Biller"],
      ["PROVIDER_FINANCE", "Finance"],
      ["PROVIDER_ADMIN", "Admin"],
      ["PROVIDER_INTEGRATION_ADMIN", "Integration Admin"],
    ];
    for (const [code, label] of personas) {
      const roleLabel = resolveProviderPersonaLabel([code]);
      expect(roleLabel).toBe(label);
      const { unmount } = render(
        <ProviderNav providerName="Nakasero Hospital" items={[]} actorName={NAME} roleLabel={roleLabel} />,
      );
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("BrokerSidebar shows the actor name and the mapped Broker role label (DEF-001 completion)", () => {
    render(<BrokerSidebar userRole="BROKER_USER" userName={NAME} />);
    expect(screen.getAllByLabelText("Signed-in user").length).toBeGreaterThan(0);
    expect(screen.getAllByText(NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Broker").length).toBeGreaterThan(0);
  });

  it("MemberNav shows the actor name and the generic Member persona (D-20)", () => {
    render(<MemberNav actorName={NAME} />);
    expect(screen.getAllByLabelText("Signed-in user").length).toBeGreaterThan(0);
    expect(screen.getAllByText(NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Member").length).toBeGreaterThan(0);
  });

  it("SignedInIdentity renders nothing when neither name nor role is known (no empty block)", () => {
    const { container } = render(<SignedInIdentity />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DEF-002 — resolveProviderPersonaLabel (pure)", () => {
  it("maps exactly the seven persona codes", () => {
    expect(Object.keys(PROVIDER_ROLE_LABELS).sort()).toEqual(
      [
        "PROVIDER_ADMIN",
        "PROVIDER_BILLER",
        "PROVIDER_CLINICIAN",
        "PROVIDER_FACILITY_ADMIN",
        "PROVIDER_FINANCE",
        "PROVIDER_FRONT_DESK",
        "PROVIDER_INTEGRATION_ADMIN",
      ].sort(),
    );
  });

  it("returns null when no persona role is present (prod before the RBAC seed → generic fallback)", () => {
    expect(resolveProviderPersonaLabel([])).toBeNull();
    // The deprecated legacy bundle is not a persona → also falls back to generic.
    expect(resolveProviderPersonaLabel(["PROVIDER_LEGACY"])).toBeNull();
    // A TPA role code carried in by accident resolves to no provider persona.
    expect(resolveProviderPersonaLabel(["CLAIMS_OFFICER"])).toBeNull();
  });

  it("is deterministic for a multi-persona user (most-representative wins)", () => {
    expect(resolveProviderPersonaLabel(["PROVIDER_FRONT_DESK", "PROVIDER_ADMIN"])).toBe("Admin");
    expect(resolveProviderPersonaLabel(["PROVIDER_BILLER", "PROVIDER_FINANCE"])).toBe("Finance");
    // The superset persona outranks every narrower one, in either row order.
    expect(resolveProviderPersonaLabel(["PROVIDER_FACILITY_ADMIN"])).toBe("Facility Admin");
    expect(resolveProviderPersonaLabel(["PROVIDER_ADMIN", "PROVIDER_FACILITY_ADMIN"])).toBe("Facility Admin");
    expect(resolveProviderPersonaLabel(["PROVIDER_FACILITY_ADMIN", "PROVIDER_FRONT_DESK"])).toBe("Facility Admin");
  });
});
