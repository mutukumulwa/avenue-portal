/**
 * F5.8 — submission-chain lineage (ClaimLineageTable): the accessible differences summary.
 * Shows both the immutable superseded record(s) and the current one, with the billed change.
 */
import { describe, it, expect, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: ReactNode }) => <a href={href} {...p}>{children}</a> }));

import { ClaimLineageTable, type ChainVersion } from "@/app/provider/claims/[id]/ClaimLineageTable";

const chain: ChainVersion[] = [
  { id: "c1", claimNumber: "CLM-1", status: "SUPERSEDED", submissionType: "ORIGINAL", billedAmount: 1000, createdAt: "2026-07-20T00:00:00Z" },
  { id: "c2", claimNumber: "CLM-2", status: "RECEIVED", submissionType: "CORRECTION", billedAmount: 1500, createdAt: "2026-07-21T00:00:00Z" },
];

describe("F5.8 ClaimLineageTable", () => {
  it("renders an accessible history table with both records and the billed difference", () => {
    render(<ClaimLineageTable chain={chain} currentClaimId="c2" currency="UGX" />);
    const table = screen.getByRole("table");
    expect(table).toHaveAccessibleName(/every version of this claim/i); // <caption>
    // both the immutable superseded record and the current one
    expect(screen.getByRole("link", { name: "CLM-1" })).toHaveAttribute("href", "/provider/claims/c1");
    expect(screen.getByText(/CLM-2/)).toBeInTheDocument();
    // the differences summary: +UGX 500
    expect(screen.getByText(/\+UGX\s*500/)).toBeInTheDocument();
    // both statuses surfaced, the active one marked current
    expect(screen.getByText("SUPERSEDED")).toBeInTheDocument();
    expect(screen.getByText(/RECEIVED · current/)).toBeInTheDocument();
    // the current version is aria-current
    expect(screen.getByRole("row", { current: true })).toBeInTheDocument();
  });

  it("renders nothing for a single-version claim (no lineage to show)", () => {
    const { container } = render(<ClaimLineageTable chain={[chain[0]]} currentClaimId="c1" currency="UGX" />);
    expect(container).toBeEmptyDOMElement();
  });
});
