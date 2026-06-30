// ─── QUOTATION PDF TEMPLATE ───────────────────────────────────────────────────
// Renders an HTML string for Puppeteer to convert to PDF.
// Brand: Sora headings, Hanken Grotesk body, indigo primary (#0B1437).

export interface QuotationTemplateData {
  quoteNumber: string;
  issuedDate: string;
  validUntil: string;
  tenantName: string;
  tenantLogoUrl?: string;
  clientName: string;
  clientType: "CORPORATE" | "INDIVIDUAL";
  packageName: string;
  requestedCoverStart: string;
  brokerName?: string;
  lineItems: Array<{
    description: string;
    lineType: string;
    lifeName?: string;
    baseAmount: number;
    netAmount: number;
    isSubtotal?: boolean;
    isTax?: boolean;
  }>;
  totalContribution: number;
  memberCount: number;
  dependentCount: number;
  notes?: string;
}

export function renderQuotationHtml(data: QuotationTemplateData): string {
  const fmt = (n: number) =>
    `KES ${Math.round(n).toLocaleString("en-UG", { minimumFractionDigits: 0 })}`;

  const lineRows = data.lineItems
    .map((l) => {
      const style = l.isSubtotal
        ? `font-weight:700; border-top:2px solid #0B1437; background:#f8f9ff;`
        : l.isTax
        ? `color:#6C757D; font-size:12px;`
        : "";
      return `
        <tr style="${style}">
          <td style="padding:6px 10px; border-bottom:1px solid #eee;">${l.description}${l.lifeName ? ` <span style="color:#6C757D; font-size:11px;">(${l.lifeName})</span>` : ""}</td>
          <td style="padding:6px 10px; text-align:right; border-bottom:1px solid #eee; white-space:nowrap;">${fmt(l.netAmount)}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Hanken+Grotesk:wght@400;700&display=swap" rel="stylesheet" />
<title>Quotation ${data.quoteNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hanken Grotesk', sans-serif; color: #1a1a2e; font-size:13px; line-height:1.5; }
  h1,h2,h3 { font-family: 'Sora', sans-serif; }
  .indigo { color: #0B1437; }
  .muted  { color: #6C757D; }
  .header { background: #0B1437; color: white; padding: 28px 32px; display:flex; justify-content:space-between; align-items:center; }
  .header h1 { font-size: 22px; font-weight:700; letter-spacing:-0.5px; }
  .header .meta { text-align:right; font-size:12px; opacity:0.85; line-height:1.8; }
  .body { padding: 28px 32px; }
  .section { margin-bottom: 22px; }
  .section-title { font-family:'Sora',sans-serif; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#0B1437; margin-bottom:10px; padding-bottom:4px; border-bottom:2px solid #0B1437; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .label { font-size:11px; color:#6C757D; font-weight:700; text-transform:uppercase; margin-bottom:2px; }
  .value { font-size:13px; color:#1a1a2e; font-weight:700; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  thead th { background:#f0f1fa; padding:8px 10px; text-align:left; font-family:'Sora',sans-serif; font-size:11px; font-weight:700; text-transform:uppercase; color:#0B1437; }
  thead th:last-child { text-align:right; }
  .total-row td { padding:10px; font-weight:700; font-size:15px; background:#0B1437; color:white; }
  .total-row td:last-child { text-align:right; }
  .footer { margin-top:32px; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#6C757D; display:flex; justify-content:space-between; }
  .badge { display:inline-block; background:#f0f1fa; color:#0B1437; font-size:10px; font-weight:700; text-transform:uppercase; padding:2px 8px; border-radius:20px; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <h1>${data.tenantName}</h1>
    <div style="margin-top:6px; font-size:13px; opacity:0.9;">Membership Quotation</div>
  </div>
  <div class="meta">
    <div><strong>${data.quoteNumber}</strong></div>
    <div>Issued: ${data.issuedDate}</div>
    <div>Valid until: ${data.validUntil}</div>
  </div>
</div>

<div class="body">

  <!-- Client & package -->
  <div class="section">
    <div class="section-title">Quotation Details</div>
    <div class="grid2">
      <div>
        <div class="label">Client</div>
        <div class="value">${data.clientName}</div>
        <div class="muted" style="font-size:12px; margin-top:2px;">${data.clientType === "CORPORATE" ? "Corporate Scheme" : "Individual / Family"}</div>
      </div>
      <div>
        <div class="label">Benefit Package</div>
        <div class="value">${data.packageName}</div>
      </div>
      <div>
        <div class="label">Requested Cover Start</div>
        <div class="value">${data.requestedCoverStart}</div>
      </div>
      <div>
        <div class="label">Lives Covered</div>
        <div class="value">${data.memberCount} principal${data.memberCount !== 1 ? "s" : ""}${data.dependentCount > 0 ? ` + ${data.dependentCount} dependant${data.dependentCount !== 1 ? "s" : ""}` : ""}</div>
      </div>
      ${data.brokerName ? `
      <div>
        <div class="label">Intermediary</div>
        <div class="value">${data.brokerName}</div>
      </div>` : ""}
    </div>
  </div>

  <!-- Contribution schedule -->
  <div class="section">
    <div class="section-title">Contribution Schedule</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:right">Amount (KES)</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td>Total Annual Contribution</td>
          <td>${fmt(data.totalContribution)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Statutory taxes note -->
  <div class="section" style="background:#f8f9ff; border:1px solid #e0e3f0; border-radius:6px; padding:14px;">
    <p style="font-size:12px; color:#6C757D;">
      <strong style="color:#0B1437;">Statutory levies</strong> — Stamp Duty (KES 40/member/year), Training Levy (0.2% of base contribution),
      and PHCF (0.25% of base contribution) are included as separate line items above in compliance with Kenyan regulatory requirements.
    </p>
  </div>

  ${data.notes ? `
  <div class="section">
    <div class="section-title">Notes</div>
    <p style="font-size:12px; color:#6C757D;">${data.notes}</p>
  </div>` : ""}

</div>

<!-- Footer -->
<div class="body" style="padding-top:0;">
  <div class="footer">
    <div>This quotation is valid until ${data.validUntil} and is subject to full underwriting terms.</div>
    <div>Generated by Medvex Membership Platform</div>
  </div>
</div>

</body>
</html>`;
}
