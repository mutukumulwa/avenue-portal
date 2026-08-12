/**
 * UAT-HF P09.02 acceptance — "`300k` never becomes 300; `300000` reads back
 * `UGX 300,000`; 0%, 100%, boundaries, decimal and invalid formats round-trip
 * correctly."
 *
 * DEF-018: 'Typing the everyday shorthand "300k" ... leaves the field holding
 * "300". The input reports itself valid, the browser validation message is
 * empty, and no inline error, hint or warning is shown ... A package saved this
 * way would cap the benefit at UGX 300.'
 * DEF-021: "Zero is conflated with empty."
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { MoneyField, PercentField } from "@/components/forms/MoneyField";
import { coContributionRuleRefinement } from "@/lib/validation/co-contribution";
import { z } from "zod";

const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe("P09.02 DEF-018 — a magnitude suffix is refused, loudly", () => {
  it('"300k" is rejected and named, never silently truncated', () => {
    render(<MoneyField name="annualLimit" label="Overall Annual Limit" />);
    const input = screen.getByLabelText(/Overall Annual Limit/i);
    type(input, "300k");

    // The value the run watched get silently kept.
    expect(screen.queryByText(/^UGX 300$/)).not.toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/'k' and 'm' are not accepted/i);
    expect(alert).toHaveTextContent(/For 300 thousand, enter 300000/);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it('"2m" is rejected too', () => {
    render(<MoneyField name="a" label="Limit" />);
    type(screen.getByLabelText(/Limit/i), "2m");
    expect(screen.getByRole("alert")).toHaveTextContent(/not accepted/i);
  });

  it("is a TEXT input — type=number is what swallowed the suffix", () => {
    render(<MoneyField name="a" label="Limit" />);
    // The browser parses leading digits out of "300k" and reports the field
    // valid, which is exactly the silence the run recorded.
    expect(screen.getByLabelText(/Limit/i)).toHaveAttribute("type", "text");
  });

  it("the package builder no longer uses a number input for money", () => {
    const builder = readFileSync("src/app/(admin)/packages/builder/page.tsx", "utf8");
    expect(builder).toContain("<MoneyField");
    expect(builder).not.toMatch(/name="annualLimit"[^>]*type="number"/);
    expect(builder).not.toMatch(/name="contributionAmount"[^>]*type="number"/);
  });
});

describe("P09.02 DEF-018 — what was understood is read back", () => {
  it('"300000" reads back "UGX 300,000"', () => {
    render(<MoneyField name="a" label="Limit" />);
    type(screen.getByLabelText(/Limit/i), "300000");
    expect(screen.getByText("UGX 300,000")).toBeInTheDocument();
  });

  it("the formats that already worked still work, and read back the same", () => {
    // The run noted these succeeded — which is what trained the user to trust
    // human formatting. They must keep working, visibly.
    for (const input of ["300,000", "UGX 300000"]) {
      const { unmount } = render(<MoneyField name="a" label="Limit" />);
      type(screen.getByLabelText(/Limit/i), input);
      expect(screen.getByText("UGX 300,000"), input).toBeInTheDocument();
      unmount();
    }
  });

  it("shows the hint, not an error, while the field is empty", () => {
    render(<MoneyField name="a" label="Limit" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Do not use 'k' or 'm'/i)).toBeInTheDocument();
  });

  it("prefers the live parse error over a stale server error", () => {
    render(<MoneyField name="a" label="Limit" error="Server said no" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server said no");
    // Once the user types something invalid, the message is about what is on
    // screen now — not about what was submitted a moment ago.
    type(screen.getByLabelText(/Limit/i), "300k");
    expect(screen.getByRole("alert")).toHaveTextContent(/not accepted/i);
  });
});

describe("P09.02 DEF-021 — 0% is a value, not a blank", () => {
  const schema = z
    .object({ type: z.string(), fixedAmount: z.number().nullable().optional(), percentage: z.number().nullable().optional() })
    .superRefine(coContributionRuleRefinement);

  it("accepts a 0% percentage rule", () => {
    // "A 0% co-contribution (the plan covers everything for that category and
    // network tier) is a legitimate configuration."
    expect(schema.safeParse({ type: "PERCENTAGE", percentage: 0 }).success).toBe(true);
    expect(schema.safeParse({ type: "HYBRID", percentage: 0 }).success).toBe(true);
  });

  it("accepts the whole advertised range, boundaries included", () => {
    for (const percentage of [0, 0.5, 10, 99.99, 100]) {
      expect(schema.safeParse({ type: "PERCENTAGE", percentage }).success, String(percentage)).toBe(true);
    }
  });

  it("still refuses a MISSING percentage, and says 0 is available", () => {
    const result = schema.safeParse({ type: "PERCENTAGE", percentage: null });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.error.issues[0].message).toMatch(/Enter 0 if the member pays nothing/i);
  });

  it("refuses a negative AS a negative, not as a missing value", () => {
    // "the message points the underwriter at the wrong cause — it says a value
    // is required when one was supplied."
    const result = schema.safeParse({ type: "PERCENTAGE", percentage: -5 });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.error.issues[0].message).toMatch(/cannot be negative/i);
    expect(result.error.issues[0].message).not.toMatch(/is required/i);
  });

  it("applies the same rule to a fixed amount", () => {
    expect(schema.safeParse({ type: "FIXED_AMOUNT", fixedAmount: 0 }).success).toBe(true);
    const missing = schema.safeParse({ type: "FIXED_AMOUNT", fixedAmount: null });
    expect(missing.success).toBe(false);
    const negative = schema.safeParse({ type: "FIXED_AMOUNT", fixedAmount: -1 });
    expect(negative.success).toBe(false);
    if (!negative.success) expect(negative.error.issues[0].message).toMatch(/cannot be negative/i);
  });
});

describe("P09.02 the percentage field states the range it really accepts", () => {
  it("says 0 is allowed", () => {
    render(<PercentField name="percentage" label="Percentage" />);
    expect(screen.getByText(/Enter 0 if the member pays nothing/i)).toBeInTheDocument();
  });

  it("reads back what it understood", () => {
    render(<PercentField name="percentage" label="Percentage" />);
    type(screen.getByLabelText(/Percentage/i), "20");
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("accepts 0 without complaining", () => {
    render(<PercentField name="percentage" label="Percentage" />);
    type(screen.getByLabelText(/Percentage/i), "0");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("rejects above 100", () => {
    render(<PercentField name="percentage" label="Percentage" />);
    type(screen.getByLabelText(/Percentage/i), "101");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
