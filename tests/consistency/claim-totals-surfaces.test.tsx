/**
 * DEC-FH-X11 (owner, 2026-09-11) on the screens people read totals from:
 * "they should not count in totals given that they have been withdrawn. they
 * should be in logs" — and the same for superseded claims.
 *
 * Every page below renders against one fixture of seven claims at one facility:
 * four that count (approved, received, declined outpatient; approved inpatient)
 * and three that do not (withdrawn and superseded outpatient; withdrawn
 * inpatient). Each test reads the figure off the rendered page — the totals are
 * the four, and the withdrawn and superseded claims are still in the list.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { fakeModel, type Row } from "../fixtures/claim-totals-db";

const holder = vi.hoisted(() => ({
  session: { user: { id: "u1", role: "SUPER_ADMIN", tenantId: "t1", groupId: "g1" as string | undefined } },
}));
const data = vi.hoisted(() => ({
  claims: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  groups: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  providers: [] as Record<string, unknown>[],
}));
const db = vi.hoisted(() => ({
  claim: {} as Record<string, unknown>,
  claimLine: {} as Record<string, unknown>,
  clinicalCase: {} as Record<string, unknown>,
  group: {} as Record<string, unknown>,
  invoice: {} as Record<string, unknown>,
  provider: {} as Record<string, unknown>,
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/rbac", async (original) => ({
  ...(await original<typeof import("@/lib/rbac")>()),
  requireRole: vi.fn(async () => holder.session),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => holder.session, getCachedSession: async () => holder.session }));
vi.mock("@/lib/analytics-access", () => ({
  getAnalyticsAccessScope: async () => ({ tenantId: "t1", userId: "u1", role: "SUPER_ADMIN" }),
}));
vi.mock("@/lib/perf", () => ({ measureAsync: <T,>(_label: string, work: () => Promise<T>) => work() }));
vi.mock("@/components/pdf/ExportPDFButton", () => ({ ExportPDFButton: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
  redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); },
}));
vi.mock("@/server/services/provider-access.service", () => ({
  ProviderAccessService: {
    resolveUserContext: async () => ({
      ctx: { tenantId: "t1" },
      provider: { id: "p1", name: "Fixture Clinic", type: "CLINIC", tier: "PARTNER", county: null, contractStatus: "ACTIVE" },
    }),
  },
}));

import ProviderDashboard from "@/app/provider/dashboard/page";
import ReportDetailPage from "@/app/(admin)/reports/[reportType]/page";
import { GET as exportReport } from "@/app/api/reports/[reportType]/export/route";
import HRUtilizationPage from "@/app/(hr)/hr/utilization/page";
import ClaimsPage from "@/app/(admin)/claims/page";
import FundClaimsPage from "@/app/fund/[groupId]/claims/page";

Object.assign(db.claim, fakeModel(() => data.claims));
Object.assign(db.claimLine, fakeModel(() => data.lines));
Object.assign(db.clinicalCase, fakeModel(() => []));
Object.assign(db.group, fakeModel(() => data.groups));
Object.assign(db.invoice, fakeModel(() => data.invoices));
Object.assign(db.provider, fakeModel(() => data.providers));

const SEEN = new Date("2026-09-10T08:00:00Z");
const group = { id: "g1", name: "Fixture Group" };
const person = (id: string) => ({ id, groupId: "g1", group, firstName: "Ada", lastName: `Fixture ${id}`, memberNumber: `X11-${id}` });

function claim(id: string, status: string, billed: number, extra: Row = {}): Row {
  return {
    id, claimNumber: `CLM-${id}`, tenantId: "t1", providerId: "p1", memberId: "m1", member: person("m1"),
    provider: { id: "p1", name: "Fixture Clinic" }, status, serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT",
    caseId: null, billedAmount: billed, approvedAmount: 0, paidAmount: 0, currency: "UGX", isReimbursement: false,
    dateOfService: SEEN, createdAt: SEEN, receivedAt: SEEN, admissionDate: null, dischargeDate: null, lengthOfStay: null,
    decidedAt: null, declineReasonCode: null, declineNotes: null, contract: null, _count: { exceptionLogs: 0 },
    fundTransactions: [], ...extra,
  };
}

const APPROVED = claim("approved", "APPROVED", 100_000, { approvedAmount: 80_000, paidAmount: 80_000, decidedAt: SEEN });
const RECEIVED = claim("received", "RECEIVED", 50_000);
const DECLINED = claim("declined", "DECLINED", 10_000, { declineReasonCode: "EXCLUDED", decidedAt: SEEN });
// The withdrawn outpatient claim is the only one for its member, so a leak also
// shows up in "Unique Members".
const WITHDRAWN = claim("withdrawn", "WITHDRAWN", 33_900, { memberId: "m3", member: person("m3") });
const SUPERSEDED = claim("superseded", "SUPERSEDED", 20_000);
const INPATIENT = { serviceType: "INPATIENT", benefitCategory: "INPATIENT", admissionDate: SEEN };
const ADMITTED = claim("admitted", "APPROVED", 500_000, { ...INPATIENT, approvedAmount: 400_000, lengthOfStay: 3, memberId: "m2", member: person("m2") });
const ADMISSION_WITHDRAWN = claim("admission-withdrawn", "WITHDRAWN", 300_000, { ...INPATIENT, lengthOfStay: 11, memberId: "m2", member: person("m2") });
const FIXTURE = [APPROVED, RECEIVED, DECLINED, WITHDRAWN, SUPERSEDED, ADMITTED, ADMISSION_WITHDRAWN];

function line(id: string, onClaim: Row, cptCode: string, billed: number, tariffRate: number | null): Row {
  return {
    id, claim: onClaim, cptCode, description: `Service ${cptCode}`, billedAmount: billed, approvedAmount: 0, tariffRate,
    adjudicationDecision: null, disallowedAmount: 0, declineReason: null, reasonCode: null,
  };
}

/** The figure printed under a KPI label: the next <p> in the label's card. */
function figure(label: string): string {
  const labelEl = screen.getByText(label);
  const card = labelEl.closest("div[class*='border']") as HTMLElement;
  const ps = [...card.querySelectorAll("p")];
  return ps[ps.indexOf(labelEl as HTMLParagraphElement) + 1]?.textContent ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  holder.session = { user: { id: "u1", role: "SUPER_ADMIN", tenantId: "t1", groupId: "g1" } };
  data.claims = FIXTURE;
  data.lines = [
    line("l-approved", APPROVED, "99213", 100_000, 90_000),
    line("l-withdrawn", WITHDRAWN, "99213", 33_900, 90_000),
    line("l-superseded", SUPERSEDED, "97110", 20_000, null),
  ];
  data.groups = [{
    id: "g1", tenantId: "t1", name: "Fixture Group", fundingMode: "SELF_FUNDED", fundAdministrators: [{ id: "u1" }],
    selfFundedAccount: { balance: 0, totalClaims: 0, heldCategories: [] },
  }];
  data.invoices = [{ groupId: "g1", tenantId: "t1", totalAmount: 1_000_000 }];
  data.providers = [{ id: "p1", tenantId: "t1", name: "Fixture Clinic" }];
});

describe("facility dashboard", () => {
  it("\"Total claims\" is the four that count; recent claims still shows the withdrawn and superseded ones", async () => {
    render((await ProviderDashboard()) as ReactElement);
    expect(figure("Total claims")).toBe("4");
    expect(figure("Paid to date")).toBe("UGX 80,000");
    expect(screen.getByText("CLM-withdrawn")).toBeInTheDocument();
    expect(screen.getByText("CLM-superseded")).toBeInTheDocument();
  });
});

describe("TPA reports", () => {
  const open = async (reportType: string) =>
    render((await ReportDetailPage({ params: Promise.resolve({ reportType }) })) as ReactElement);

  it("Claims Summary: KPIs count four claims; the record count and table keep all seven", async () => {
    await open("claims");
    expect(figure("Total Claims")).toBe("4");
    expect(figure("Total Billed (UGX)")).toBe((660_000).toLocaleString());
    expect(figure("Total Approved (UGX)")).toBe((480_000).toLocaleString());
    expect(screen.getByText(/7 records/)).toBeInTheDocument();
    expect(screen.getByText("CLM-withdrawn")).toBeInTheDocument();
  });

  it("Admissions: one admission, its stay alone in the average; both claims listed", async () => {
    await open("admissions");
    expect(figure("Total Admissions")).toBe("1");
    expect(figure("Total Billed (UGX)")).toBe((500_000).toLocaleString());
    expect(figure("Avg Length of Stay")).toBe("3.0 days");
    expect(screen.getByText(/2 records/)).toBeInTheDocument();
    expect(screen.getByText("CLM-admission-withdrawn")).toBeInTheDocument();
  });

  it("OPD visits: three visits by one member; all five outpatient claims listed", async () => {
    await open("admission-visits");
    expect(figure("Total OPD Visits")).toBe("3");
    expect(figure("Unique Members")).toBe("1");
    expect(figure("Avg Visits / Member")).toBe("3.0");
    expect(figure("Total Billed (UGX)")).toBe((160_000).toLocaleString());
    expect(screen.getByText(/5 records/)).toBeInTheDocument();
  });

  it("Claims Experience: every figure is a total, so only claims that count are in it", async () => {
    await open("claims-experience");
    expect(figure("Total Billed (UGX)")).toBe((660_000).toLocaleString());
    const outpatient = screen.getByText("OUTPATIENT").closest("tr") as HTMLElement;
    expect(within(outpatient).getAllByRole("cell").map((c) => c.textContent)).toEqual(
      ["Fixture Group", "OUTPATIENT", "3", (160_000).toLocaleString(), (80_000).toLocaleString(), "1", "66.7%"],
    );
  });

  it("Service Cost Comparison: lines of withdrawn and superseded claims are not averaged", async () => {
    await open("comparison-services");
    expect(figure("Total Claim Lines")).toBe("1");
    expect(figure("Distinct CPT Codes")).toBe("1");
  });

  it("Exclusion & Rejected: withdrawn and superseded rows are listed, not totalled", async () => {
    await open("exclusion-rejected");
    expect(figure("Total Excluded/Declined")).toBe("1");
    expect(figure("Total Disallowed (UGX)")).toBe((10_000).toLocaleString());
    expect(screen.getByText(/4 records/)).toBeInTheDocument();
    expect(screen.getByText("CLM-superseded")).toBeInTheDocument();
  });
});

describe("TPA report CSV exports match the pages", () => {
  const csv = async (reportType: string) => {
    const res = await exportReport(new Request(`https://x/api/reports/${reportType}/export`), { params: Promise.resolve({ reportType }) });
    return (await res.text()).split("\r\n").slice(1);
  };

  it("claims-experience and comparison-services leave them out", async () => {
    expect(await csv("claims-experience")).toEqual([
      `Fixture Group,INPATIENT,1,500000,400000,0,100.0`,
      `Fixture Group,OUTPATIENT,3,160000,80000,1,66.7`,
    ]);
    const [only, ...rest] = await csv("comparison-services");
    expect(rest).toEqual([]);
    expect(only.split(",").slice(0, 1).concat(only.split(",").slice(-1))).toEqual(["99213", "1"]);
  });

  it("the claims register still exports every claim", async () => {
    expect(await csv("claims")).toHaveLength(7);
  });
});

describe("HR utilization", () => {
  it("counts and spends only the four claims that count", async () => {
    render((await HRUtilizationPage()) as ReactElement);
    expect(figure("Total Claims")).toBe("4");
    expect(figure("Total Approved Spend")).toBe(`UGX ${(480_000).toLocaleString()}`);
    expect(figure("Fund Utilization (Loss Ratio)")).toBe("48.0%");
    expect(screen.getByText("3 claims")).toBeInTheDocument(); // OUTPATIENT: approved, received, declined
  });
});

describe("TPA claims list", () => {
  const open = async (params: Record<string, string> = {}) =>
    render((await ClaimsPage({ searchParams: Promise.resolve(params) })) as ReactElement);

  it("the Total card leaves out the three, says so, and the list and paging keep all seven", async () => {
    await open();
    expect(figure("Total")).toBe("4");
    expect(screen.getByText("Excludes 3 withdrawn or superseded")).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1 · 7 claims/)).toBeInTheDocument();
    expect(screen.getByText("CLM-withdrawn")).toBeInTheDocument();
  });

  it("filtering by WITHDRAWN shows them and counts them — the filter asked for them", async () => {
    await open({ status: "WITHDRAWN" });
    expect(figure("Total")).toBe("2");
    expect(screen.queryByText(/^Excludes/)).not.toBeInTheDocument();
  });
});

describe("self-funded scheme claims", () => {
  it("\"Total Claims\" is the four; the table lists all seven", async () => {
    holder.session = { user: { id: "u1", role: "FUND_ADMINISTRATOR", tenantId: "t1", groupId: undefined } };
    render((await FundClaimsPage({ params: Promise.resolve({ groupId: "g1" }) })) as ReactElement);
    expect(figure("Total Claims")).toBe("4");
    expect(screen.getAllByRole("row")).toHaveLength(1 + 7);
  });
});

describe("claim counts read through a relation count", () => {
  // These pages load much more than claims; what matters here is that their
  // claim count carries the rule, so pin it at the query.
  it.each([
    "src/app/(admin)/members/[id]/page.tsx",
    "src/app/(admin)/providers/[id]/page.tsx",
    "src/app/(admin)/providers/page.tsx",
    "src/app/(admin)/contracts/[id]/page.tsx",
    "src/server/trpc/routers/providers.ts",
    "src/server/trpc/routers/contracts.ts",
  ])("%s counts claims with COUNTED_IN_TOTALS", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/claims: \{ where: COUNTED_IN_TOTALS \}/);
    expect(src).not.toMatch(/claims: true/);
  });
});
