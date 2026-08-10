/**
 * DEF-012 + SP-2 — the client form must (a) surface all five PayerType values and
 * the currency allow-list, (b) show the member prefix + slug READ-ONLY on edit
 * (immutable — a mutation would orphan minted member numbers), (c) lock the
 * currency select when D8 says so. The server actions are mocked because this
 * test only exercises rendering, not submission.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/app/(admin)/clients/new/actions", () => ({ createClientAction: vi.fn() }));
vi.mock("@/app/(admin)/clients/[id]/edit/actions", () => ({ updateClientAction: vi.fn() }));

import { ClientForm } from "@/app/(admin)/clients/ClientForm";

const editClient = {
  id: "c1",
  name: "Lakeview Ltd",
  type: "INSURER",
  currency: "UGX",
  status: "ACTIVE",
  slug: "lakeview-ltd",
  memberNumberPrefix: "LMU",
  parentClientId: null,
};

describe("ClientForm — create mode", () => {
  it("exposes all five PayerType options with labels (DEF-013)", () => {
    render(<ClientForm parents={[]} />);
    const type = screen.getByLabelText(/type/i);
    const opts = within(type as HTMLElement).getAllByRole("option").map((o) => o.textContent);
    expect(opts).toHaveLength(5);
    expect(opts).toContain("Government scheme");
    expect(opts).toContain("TPA / Claims manager");
  });

  it("offers the currency allow-list as an explicit select", () => {
    render(<ClientForm parents={[]} />);
    const cur = screen.getByLabelText(/currency/i) as HTMLSelectElement;
    const opts = within(cur).getAllByRole("option").map((o) => o.textContent);
    expect(opts).toEqual(["UGX", "KES", "USD"]);
  });

  it("lets you enter prefix and slug", () => {
    render(<ClientForm parents={[]} />);
    const prefix = screen.getByLabelText(/member-number prefix/i) as HTMLInputElement;
    const slug = screen.getByLabelText(/code \/ slug/i) as HTMLInputElement;
    expect(prefix.disabled).toBe(false);
    expect(prefix.getAttribute("name")).toBe("memberNumberPrefix");
    expect(slug.disabled).toBe(false);
    expect(slug.getAttribute("name")).toBe("slug");
  });
});

describe("ClientForm — edit mode (DEF-012)", () => {
  it("shows the member prefix and slug READ-ONLY with their persisted values", () => {
    render(<ClientForm client={editClient} parents={[]} />);
    const prefix = screen.getByLabelText(/member-number prefix/i) as HTMLInputElement;
    const slug = screen.getByLabelText(/code \/ slug/i) as HTMLInputElement;
    expect(prefix.value).toBe("LMU");
    expect(prefix.disabled).toBe(true);
    expect(slug.value).toBe("lakeview-ltd");
    expect(slug.disabled).toBe(true);
    // Immutable fields are not posted (no name attribute).
    expect(prefix.getAttribute("name")).toBeNull();
    expect(slug.getAttribute("name")).toBeNull();
  });

  it("keeps the currency editable when not locked", () => {
    render(<ClientForm client={editClient} parents={[]} currencyLocked={false} />);
    const cur = screen.getByLabelText(/currency/i) as HTMLSelectElement;
    expect(cur.disabled).toBe(false);
    expect(cur.getAttribute("name")).toBe("currency");
  });

  it("locks the currency (disabled select + hidden carrier) when D8 applies", () => {
    const { container } = render(
      <ClientForm client={editClient} parents={[]} currencyLocked={true} />,
    );
    const cur = screen.getByLabelText(/currency/i) as HTMLSelectElement;
    expect(cur.disabled).toBe(true);
    // The value still posts via a hidden input so the required-currency schema passes.
    const hidden = container.querySelector('input[type="hidden"][name="currency"]') as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.value).toBe("UGX");
    expect(screen.getByText(/locked/i)).toBeTruthy();
  });
});
