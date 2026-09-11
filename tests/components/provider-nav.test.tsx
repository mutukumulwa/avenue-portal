/**
 * Family Hospital UAT plan P06 (FH-08) — the grouped provider navigation.
 *
 * The old bar put all fifteen destinations, the identity block and Logout in
 * one fixed row; with a facility administrator's items it ran over the brand
 * and Dashboard could not be clicked. These tests pin the replacement: the
 * brand and Dashboard are separate links, four destinations are direct, the
 * rest are in task menus, the facility profile and Logout are in the account
 * menu, every destination is reachable, and every disclosure closes on Escape
 * (focus back on its button), on a press outside, and on tabbing away.
 *
 * Widths, overlap and zoom are layout facts jsdom cannot measure; the browser
 * matrix in the implementation log covers them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";

const route = vi.hoisted(() => ({ pathname: "/provider/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("next-auth/react", () => auth);
// A plain anchor that does not ask jsdom to navigate; the nav's own click
// handling (close, focus return) still runs.
vi.mock("next/link", () => ({
  default: ({ href, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...rest} onClick={(event) => { event.preventDefault(); onClick?.(event); }}>{children}</a>
  ),
}));

import { ProviderNav } from "@/components/layouts/ProviderNav";
import { computeProviderNav, PROVIDER_NAV_DEFINITIONS, type ProviderNavGroupView } from "@/components/layouts/provider-nav-model";
import { PROVIDER_ROLE_PERMISSIONS } from "@/../prisma/seeds/provider-rbac";

/** The most destinations any provider user can have: facility administrator with contracts on. */
const ADMIN = computeProviderNav(PROVIDER_ROLE_PERMISSIONS.PROVIDER_FACILITY_ADMIN, { flags: { contractView: true } });
const MENUS = ["Care & claims", "Finance", "Contracts & Services", "Reports", "Administration"];

function renderNav(pathname = "/provider/dashboard", groups: ProviderNavGroupView[] = ADMIN) {
  route.pathname = pathname;
  const ui = () => <ProviderNav providerName="Family Healthcare" groups={groups} actorName="Grace Tester" roleLabel="Facility Admin" />;
  const view = render(ui());
  return { ...view, navigate: (to: string) => { route.pathname = to; view.rerender(ui()); } };
}
/** The desktop bar (the compact panel is hidden until its button is pressed). */
const bar = () => screen.getByRole("navigation", { name: "Provider" });
const menuButton = (name: string) => within(bar()).getByRole("button", { name });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("P06 ProviderNav", () => {
  it("the brand and Dashboard are separate links to the dashboard", () => {
    renderNav();
    const brand = screen.getByRole("link", { name: /Medvex/ });
    const dashboard = within(bar()).getByRole("link", { name: "Dashboard" });
    expect(brand).toHaveAttribute("href", "/provider/dashboard");
    expect(dashboard).toHaveAttribute("href", "/provider/dashboard");
    expect(brand).not.toBe(dashboard);
    expect(brand).not.toContainElement(dashboard);
  });

  it("four destinations are direct links and the rest sit in closed task menus", () => {
    renderNav();
    const direct = within(bar()).getAllByRole("link").map((a) => a.textContent);
    expect(direct).toEqual(["Dashboard", "Eligibility", "Claims", "Pre-auth"]);
    for (const name of MENUS) expect(menuButton(name)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Settlements" })).not.toBeInTheDocument();
  });

  it("every destination a facility administrator may open is reachable, each from exactly one place", () => {
    renderNav();
    const reached: string[] = within(bar()).getAllByRole("link").map((a) => a.getAttribute("href")!);
    for (const name of MENUS) {
      fireEvent.click(menuButton(name));
      const panel = screen.getByRole("list", { name });
      reached.push(...within(panel).getAllByRole("link").map((a) => a.getAttribute("href")!));
    }
    fireEvent.click(screen.getByRole("button", { name: /Account: Grace Tester/ }));
    reached.push(...within(screen.getByRole("list", { name: "Account" })).getAllByRole("link").map((a) => a.getAttribute("href")!));
    expect(reached).toHaveLength(PROVIDER_NAV_DEFINITIONS.length);
    expect([...reached].sort()).toEqual(PROVIDER_NAV_DEFINITIONS.map((d) => d.href).sort());
  });

  it("Escape closes a menu and puts focus back on its button", () => {
    renderNav();
    const finance = menuButton("Finance");
    finance.focus();
    fireEvent.click(finance);
    expect(finance).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(finance, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Settlements" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(finance).toHaveAttribute("aria-expanded", "false");
    expect(finance).toHaveFocus();
    expect(screen.queryByRole("link", { name: "Settlements" })).not.toBeInTheDocument();
  });

  it("a press outside closes a menu", () => {
    renderNav();
    fireEvent.click(menuButton("Administration"));
    expect(screen.getByRole("link", { name: "Users" })).toBeVisible();
    fireEvent.pointerDown(document.body);
    expect(menuButton("Administration")).toHaveAttribute("aria-expanded", "false");
  });

  it("tabbing away closes a menu; a blur with no destination (a Safari click inside) does not", () => {
    renderNav();
    const admin = menuButton("Administration");
    fireEvent.click(admin);
    const users = screen.getByRole("link", { name: "Users" });
    fireEvent.blur(users, { relatedTarget: null });
    expect(admin).toHaveAttribute("aria-expanded", "true");
    fireEvent.blur(users, { relatedTarget: within(bar()).getByRole("link", { name: "Dashboard" }) });
    expect(admin).toHaveAttribute("aria-expanded", "false");
  });

  it("arrow keys move within an open menu and wrap", () => {
    renderNav();
    const admin = menuButton("Administration");
    fireEvent.click(admin);
    fireEvent.keyDown(admin, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Users" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(screen.getByRole("link", { name: "Integrations" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Users" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(screen.getByRole("link", { name: "Integrations" })).toHaveFocus();
  });

  it("only one menu is open at a time", () => {
    renderNav();
    fireEvent.click(menuButton("Finance"));
    fireEvent.click(menuButton("Reports"));
    expect(menuButton("Finance")).toHaveAttribute("aria-expanded", "false");
    expect(menuButton("Reports")).toHaveAttribute("aria-expanded", "true");
  });

  it("choosing an entry closes the menu and returns focus to its button; navigating closes any open menu", () => {
    const { navigate } = renderNav();
    fireEvent.click(menuButton("Finance"));
    fireEvent.click(screen.getByRole("link", { name: "Settlements" }));
    expect(menuButton("Finance")).toHaveAttribute("aria-expanded", "false");
    expect(menuButton("Finance")).toHaveFocus();

    fireEvent.click(menuButton("Reports"));
    navigate("/provider/performance");
    expect(menuButton("Reports")).toHaveAttribute("aria-expanded", "false");
  });

  it("marks the current destination, and the menu that holds it", () => {
    const { navigate } = renderNav("/provider/settlements");
    expect(menuButton("Finance")).toHaveAttribute("aria-current", "true");
    expect(menuButton("Reports")).not.toHaveAttribute("aria-current");
    fireEvent.click(menuButton("Finance"));
    expect(screen.getByRole("link", { name: "Settlements" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Payment queries" })).not.toHaveAttribute("aria-current");

    navigate("/provider/claims");
    expect(within(bar()).getByRole("link", { name: "Claims" })).toHaveAttribute("aria-current", "page");
    expect(menuButton("Finance")).not.toHaveAttribute("aria-current");

    navigate("/provider/claims/clm-1/correct"); // a page under Claims
    expect(within(bar()).getByRole("link", { name: "Claims" })).toHaveAttribute("aria-current", "true");

    navigate("/provider/claims/new"); // its own destination, in Care & claims
    expect(within(bar()).getByRole("link", { name: "Claims" })).not.toHaveAttribute("aria-current");
    expect(menuButton("Care & claims")).toHaveAttribute("aria-current", "true");
  });

  it("the account menu holds identity, the facility profile and Logout", () => {
    renderNav();
    const account = screen.getByRole("button", { name: /Account: Grace Tester/ });
    expect(account).toHaveTextContent("Facility Admin"); // visible without opening (DEF-001/DEF-002)
    expect(account).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(account);
    const identity = screen.getByLabelText("Signed-in user");
    expect(identity).toBeVisible();
    expect(identity).toHaveTextContent("Grace Tester");
    expect(identity).toHaveTextContent("Facility Admin");
    expect(identity).toHaveTextContent("Family Healthcare");
    expect(screen.getByRole("link", { name: "Facility profile" })).toHaveAttribute("href", "/provider/profile");
    fireEvent.click(screen.getByRole("button", { name: "Logout" }));
    expect(auth.signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("Escape closes the account menu and returns focus to it", () => {
    renderNav();
    const account = screen.getByRole("button", { name: /Account: Grace Tester/ });
    fireEvent.click(account);
    fireEvent.keyDown(account, { key: "ArrowDown" });
    expect(screen.getByRole("link", { name: "Facility profile" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(account).toHaveAttribute("aria-expanded", "false");
    expect(account).toHaveFocus();
  });

  it("the compact Menu button opens one panel listing every group, and Escape returns focus to it", () => {
    renderNav();
    const menu = screen.getByRole("button", { name: "Menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("aria-controls", "provider-nav-panel");
    fireEvent.click(menu);
    const panel = document.getElementById("provider-nav-panel")!;
    expect(panel).toBeVisible();
    for (const label of ["Main", ...MENUS]) expect(within(panel).getByRole("list", { name: label })).toBeInTheDocument();
    const hrefs = within(panel).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toHaveLength(PROVIDER_NAV_DEFINITIONS.length - 1); // all but the facility profile (account menu)
    expect(hrefs).not.toContain("/provider/profile");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(within(panel).getByRole("link", { name: "Dashboard" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });

  it("choosing from the compact panel closes it and returns focus to Menu — even for the page already open", () => {
    renderNav("/provider/eligibility");
    const menu = screen.getByRole("button", { name: "Menu" });
    fireEvent.click(menu);
    const panel = document.getElementById("provider-nav-panel")!;
    const current = within(panel).getByRole("link", { name: "Eligibility" });
    expect(current).toHaveAttribute("aria-current", "page");
    fireEvent.click(current);
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });

  it("a biller's bar has no empty menu and no destination the biller may not open", () => {
    const groups = computeProviderNav(PROVIDER_ROLE_PERMISSIONS.PROVIDER_BILLER);
    renderNav("/provider/dashboard", groups);
    const expected = groups.filter((g) => g.presentation === "menu").map((g) => g.label);
    const shown = within(bar()).getAllByRole("button").map((b) => b.textContent);
    expect(shown).toEqual(expected);
    for (const name of expected) {
      fireEvent.click(menuButton(name));
      expect(within(screen.getByRole("list", { name })).getAllByRole("link").length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("button", { name: "Administration" })).not.toBeInTheDocument();
  });

  it("renders no authority — no permission code, provider id or branch reaches the markup", () => {
    const { container } = renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(container.innerHTML).not.toMatch(/provider\.[a-z_]+\.[a-z_]+/);
  });
});
