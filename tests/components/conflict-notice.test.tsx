/**
 * UAT-HF P04.05 — the conflict on screen (DEF-077), and the staleness prompt
 * the run scanned for and did not find (DEF-062).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ConflictNotice, humanise } from "@/components/forms/ConflictNotice";
import { SnapshotFreshness } from "@/components/forms/SnapshotFreshness";
import { describeConflict } from "@/lib/concurrency";

const CONFLICT = describeConflict({
  entity: "member",
  original: { firstName: "Valid", otherNames: "", lastName: "StaleWrite" },
  submitted: { firstName: "Valid", otherNames: "", lastName: "StaleTwo" },
  current: { firstName: "Valid", otherNames: "AWinsFirst", lastName: "StaleWrite" },
  currentUpdatedAt: new Date("2026-08-12T09:01:00Z"),
});

beforeEach(() => vi.clearAllMocks());

describe("P04.05 the conflict notice keeps the operator's work on screen", () => {
  it("says nothing was saved", () => {
    render(<ConflictNotice conflict={CONFLICT} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Nothing was saved/i);
  });

  it("shows the value the operator typed, not just the record's", () => {
    render(<ConflictNotice conflict={CONFLICT} />);
    // Losing "StaleTwo" here is losing their work a second time.
    expect(screen.getByText("StaleTwo")).toBeInTheDocument();
    expect(screen.getByText("AWinsFirst")).toBeInTheDocument();
  });

  it("separates their edits from somebody else's", () => {
    render(<ConflictNotice conflict={CONFLICT} />);
    expect(screen.getByText(/Your changes, still here/i)).toBeInTheDocument();
    expect(screen.getByText(/you did not edit these/i)).toBeInTheDocument();
  });

  it("warns that saving would have reverted the untouched field", () => {
    render(<ConflictNotice conflict={CONFLICT} />);
    expect(screen.getByText(/would have reverted them/i)).toBeInTheDocument();
  });

  it("shows when the record actually changed", () => {
    render(<ConflictNotice conflict={CONFLICT} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/EAT/);
  });

  it("renders field names a person can read", () => {
    render(<ConflictNotice conflict={CONFLICT} />);
    expect(screen.getByText("Other names")).toBeInTheDocument();
    expect(screen.getByText("Last name")).toBeInTheDocument();
  });

  it("renders nothing when there is no conflict", () => {
    const { container } = render(<ConflictNotice conflict={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a conflict has no differing fields", () => {
    const { container } = render(<ConflictNotice conflict={{ entity: "member", fields: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an empty value as a dash rather than a blank cell", () => {
    render(<ConflictNotice conflict={CONFLICT} />);
    // otherNames submitted "" — a blank cell reads as "no data", not "cleared".
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("P04.05 humanise", () => {
  it.each([
    ["otherNames", "Other names"],
    ["lastName", "Last name"],
    ["national_id", "National id"],
    ["dateOfBirth", "Date of birth"],
  ])("%s -> %s", (input, expected) => {
    expect(humanise(input)).toBe(expected);
  });
});

describe("P04.05 DEF-062 — a tab that has been away says so", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("is quiet on a live, freshly loaded view", () => {
    const { container } = render(<SnapshotFreshness />);
    expect(container).toBeEmptyDOMElement();
  });

  it("warns and offers a refresh once the tab returns after a while", () => {
    render(<SnapshotFreshness label="this member" />);

    act(() => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event("focus"));
    });

    // The run scanned for exactly this language and found none of it.
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("data-freshness", "STALE");
    expect(status).toHaveTextContent(/out of date/i);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });

  it("does NOT warn when the tab was only away a moment", () => {
    render(<SnapshotFreshness />);
    act(() => {
      vi.advanceTimersByTime(1_000);
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("refreshing asks the router to re-fetch", () => {
    render(<SnapshotFreshness />);
    act(() => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event("focus"));
    });
    act(() => {
      screen.getByRole("button", { name: /refresh/i }).click();
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("labels a cached snapshot with its as-of time", () => {
    render(<SnapshotFreshness online={false} capturedAt={new Date("2026-08-11T11:05:00Z")} />);
    const label = screen.getByText(/Cached copy/i);
    expect(label).toHaveAttribute("data-freshness", "CACHED");
    expect(label).toHaveTextContent(/11 Aug 2026/);
    expect(label).toHaveTextContent(/EAT/);
  });

  it("marks an expired snapshot as expired, not merely cached", () => {
    render(
      <SnapshotFreshness
        online={false}
        capturedAt={new Date("2026-08-10T11:05:00Z")}
        validUntil={new Date("2026-08-10T12:00:00Z")}
      />,
    );
    expect(screen.getByText(/Expired copy/i)).toHaveAttribute("data-freshness", "EXPIRED");
  });
});
