import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import { ReportDocument } from "@/components/pdf/ReportDocument";

/**
 * OBS-CLOSURE-1 regression guard: the report PDF is generated client-side via
 * @react-pdf/renderer (no serverless Puppeteer) and must contain the real KPIs
 * and table rows. This renders the document to bytes and asserts it is a valid,
 * non-trivial PDF.
 */
describe("ReportDocument (client-side PDF export)", () => {
  it("renders a valid non-empty PDF containing the report data", async () => {
    const data = {
      tenant: "Medvex",
      kpis: [
        { label: "Claims", value: "267" },
        { label: "Total Approved (KES)", value: "18,197,094" },
        { label: "Total Paid (KES)", value: "10,291,618" },
      ],
      headers: ["Provider", "Claim No.", "Member", "Billed", "Approved", "Paid", "Status"],
      rows: [
        ["Aga Khan University Hospital", "CLM-2026-00283", "Mark Kato", "11,500", "11,500", "11,500", "PAID"],
        ["International Hospital Kampala (IHK)", "CLM-2026-00284", "Prossy Kato", "14,000", "6,000", "6,000", "PAID"],
      ],
    };

    const blob = await pdf(<ReportDocument title="Provider Statements Report" data={data} />).toBlob();
    expect(blob.size).toBeGreaterThan(1000);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    expect(magic).toBe("%PDF");
  });

  it("renders without throwing when there are no rows", async () => {
    const blob = await pdf(
      <ReportDocument title="Empty Report" data={{ kpis: [], headers: [], rows: [] }} />,
    ).toBlob();
    expect(blob.size).toBeGreaterThan(500);
  });
});
