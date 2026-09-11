/**
 * Family Hospital UAT plan P03.04 / FH-10 — the controlled money input.
 * "600,000" must be accepted and shown back grouped; an invalid entry must be
 * kept exactly as typed with a field-level message; the submitted value is
 * canonical decimal text.
 */
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MoneyInput, canonicalMoney } from "@/components/forms/MoneyInput";

function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <MoneyInput label="Estimated cost" value={v} onChange={setV} currency="UGX" required />
      <output data-testid="raw">{v}</output>
    </>
  );
}

describe("MoneyInput", () => {
  it("labels the field with the case currency and marks it required", () => {
    render(<Harness />);
    expect(screen.getByLabelText(/Estimated cost \(UGX\)/)).toBeInTheDocument();
    expect(screen.getByText("(required)")).toBeInTheDocument();
  });

  it.each(["600000", "600,000", "600 000"])("accepts %j and shows it back as 600,000 on blur", (typed) => {
    render(<Harness />);
    const input = screen.getByLabelText(/Estimated cost/);
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(screen.getByTestId("raw").textContent).toBe("600,000");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("keeps an invalid entry exactly as typed and explains it at the field", () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Estimated cost/);
    fireEvent.change(input, { target: { value: "600k" } });
    fireEvent.blur(input);
    expect(screen.getByTestId("raw").textContent).toBe("600k");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/'k' and 'm' are not accepted/);
  });

  it("refuses a blank required amount after the user leaves the field", () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Estimated cost/);
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount.");
  });

  it("is a text input — never type=number, which silently empties grouped text", () => {
    render(<Harness />);
    expect(screen.getByLabelText(/Estimated cost/)).toHaveAttribute("type", "text");
  });
});

describe("canonicalMoney", () => {
  it("submits canonical decimal text, or null", () => {
    expect(canonicalMoney("600,000")).toBe("600000");
    expect(canonicalMoney("600 000.50")).toBe("600000.5");
    expect(canonicalMoney("0")).toBeNull();
    expect(canonicalMoney("abc")).toBeNull();
  });
});
