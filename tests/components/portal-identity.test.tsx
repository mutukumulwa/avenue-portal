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
import { SignedInIdentity } from "@/components/layouts/SignedInIdentity";

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

  it("ProviderNav shows the actor name and the generic Provider persona (D-20)", () => {
    render(<ProviderNav providerName="Nakasero Hospital" items={[]} actorName={NAME} />);
    expect(screen.getAllByLabelText("Signed-in user").length).toBeGreaterThan(0);
    expect(screen.getAllByText(NAME).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Provider").length).toBeGreaterThan(0);
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
