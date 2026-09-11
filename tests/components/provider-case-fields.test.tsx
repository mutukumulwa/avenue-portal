/**
 * Family Hospital UAT plan P03.05 / FH-09, FH-12 — the shared provider date and
 * benefit fields. The date shown and its `max` are the Kampala operating date
 * the SERVER computed; between 00:00 and 03:00 in Kampala the browser's
 * `toISOString()` date is still yesterday, which is the bug being removed.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { operatingTodayISO } from "@/lib/service-date";
import { BenefitSelect, ServiceDateField } from "@/components/provider/CaseFields";
import { PROVIDER_BENEFIT_OPTIONS } from "@/lib/provider-benefit-options";

describe("the Kampala window the old default got wrong", () => {
  it.each([
    ["2026-09-10T21:00:00Z", "2026-09-11"], // 00:00 in Kampala
    ["2026-09-10T22:30:00Z", "2026-09-11"], // 01:30 in Kampala
    ["2026-09-10T23:59:59Z", "2026-09-11"], // 02:59:59 in Kampala
  ])("at %s the service date is %s, not the UTC date", (instant, kampala) => {
    const now = new Date(instant);
    expect(operatingTodayISO(now)).toBe(kampala);
    expect(now.toISOString().split("T")[0]).not.toBe(kampala); // what the forms used to show
  });

  it("just before 00:00 in Kampala it is still the previous day", () => {
    expect(operatingTodayISO(new Date("2026-09-10T20:59:59Z"))).toBe("2026-09-10");
  });
});

describe("ServiceDateField", () => {
  it("shows the server's Kampala date visibly, caps it at today, and says whose date it is", () => {
    render(<ServiceDateField id="dos" value="2026-09-11" max="2026-09-11" onChange={() => {}} />);
    const input = screen.getByLabelText(/Date of service/) as HTMLInputElement;
    expect(input.value).toBe("2026-09-11");
    expect(input).toHaveAttribute("max", "2026-09-11");
    expect(input).toBeRequired();
    expect(screen.getByText(/Kampala date\. Today is filled in/)).toBeInTheDocument();
  });

  it("reports changes and shows a field error linked to the input", () => {
    const onChange = vi.fn();
    render(<ServiceDateField id="dos" value="2026-09-11" max="2026-09-11" onChange={onChange} error="The date of service cannot be in the future." />);
    const input = screen.getByLabelText(/Date of service/);
    fireEvent.change(input, { target: { value: "2026-09-09" } });
    expect(onChange).toHaveBeenCalledWith("2026-09-09");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("dos-error");
    expect(screen.getByRole("alert")).toHaveTextContent("The date of service cannot be in the future.");
  });
});

describe("BenefitSelect", () => {
  it("offers the one canonical list — inpatient and surgical included, CUSTOM absent", () => {
    render(<BenefitSelect id="ben" value="OUTPATIENT" onChange={() => {}} />);
    const select = screen.getByLabelText(/Benefit/);
    const values = within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(PROVIDER_BENEFIT_OPTIONS.map((o) => o.value));
    expect(values).toContain("INPATIENT");
    expect(values).toContain("SURGICAL");
    expect(values).not.toContain("CUSTOM");
  });

  it("offers 'Any' only where eligibility asks about cover in general", () => {
    const { rerender } = render(<BenefitSelect id="ben" value="" onChange={() => {}} allowAny />);
    expect(screen.getByRole("option", { name: "Any" })).toBeInTheDocument();
    rerender(<BenefitSelect id="ben" value="OUTPATIENT" onChange={() => {}} />);
    expect(screen.queryByRole("option", { name: "Any" })).not.toBeInTheDocument();
  });

  it("reports the chosen benefit and shows an error", () => {
    const onChange = vi.fn();
    render(<BenefitSelect id="ben" value="OUTPATIENT" onChange={onChange} error="Choose a benefit." />);
    fireEvent.change(screen.getByLabelText(/Benefit/), { target: { value: "SURGICAL" } });
    expect(onChange).toHaveBeenCalledWith("SURGICAL");
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a benefit.");
  });
});
