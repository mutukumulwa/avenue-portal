// ─── MONTHLY BOARD PACK PDF TEMPLATE ─────────────────────────────────────────
// Rendered by Puppeteer. Brand: Sora headings, Hanken Grotesk body, indigo (#0B1437).

export interface BoardPackData {
  period: string;         // e.g. "2026-04"
  tenantName: string;
  portfolio: { mlr: number; trailing12Mlr: number; contributionYtd: number };
  schemeGrid: Array<{ groupName: string; activeMembers: number; mlr: number; contribution: number }>;
  topIcdCodes: Array<{ icdCode: string; cost: number; encounters: number }>;
  providerScores: Array<{ providerName: string; providerType: string; encounterCount: number; avgCost: number; approvalRate: number }>;
  compliance: { overrideCount: number; fraudAlertCount: number };
  membership: { newMemberCount: number; lapsedCount: number };
  generatedAt: string;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `KES ${(n / 1_000).toFixed(0)}K`;
  return `KES ${Math.round(n).toLocaleString()}`;
}

function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }

function mlrColor(mlr: number) {
  if (mlr >= 0.90) return "#DC3545";
  if (mlr >= 0.75) return "#856404";
  return "#28A745";
}

export function renderBoardPackHtml(data: BoardPackData): string {
  const schemeRows = data.schemeGrid.map((s) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${s.groupName}</td>
      <td style="padding:6px 10px;text-align:right;border-bottom:1px solid #eee;">${s.activeMembers.toLocaleString()}</td>
      <td style="padding:6px 10px;text-align:right;border-bottom:1px solid #eee;color:${mlrColor(s.mlr)};font-weight:700;">${pct(s.mlr)}</td>
      <td style="padding:6px 10px;text-align:right;border-bottom:1px solid #eee;">${fmt(s.contribution)}</td>
    </tr>`).join("");

  const icdRows = data.topIcdCodes.map((c) => `
    <tr>
      <td style="padding:5px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${c.icdCode}</td>
      <td style="padding:5px 10px;text-align:right;border-bottom:1px solid #eee;">${c.encounters.toLocaleString()}</td>
      <td style="padding:5px 10px;text-align:right;border-bottom:1px solid #eee;">${fmt(c.cost)}</td>
    </tr>`).join("");

  const providerRows = data.providerScores.map((p) => `
    <tr>
      <td style="padding:5px 10px;border-bottom:1px solid #eee;">${p.providerName}</td>
      <td style="padding:5px 10px;border-bottom:1px solid #eee;color:#6C757D;font-size:11px;">${p.providerType}</td>
      <td style="padding:5px 10px;text-align:right;border-bottom:1px solid #eee;">${p.encounterCount.toLocaleString()}</td>
      <td style="padding:5px 10px;text-align:right;border-bottom:1px solid #eee;">${fmt(p.avgCost)}</td>
      <td style="padding:5px 10px;text-align:right;border-bottom:1px solid #eee;">${pct(p.approvalRate)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Hanken+Grotesk:wght@400;700&display=swap" rel="stylesheet" />
<title>Board Pack — ${data.period}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Hanken Grotesk', sans-serif; color: #1a1a2e; font-size: 12px; line-height: 1.5; }
  h1,h2,h3 { font-family: 'Sora', sans-serif; }
  .page-break { page-break-before: always; }
  .header { background: #0B1437; color: white; padding: 24px 32px; }
  .header h1 { font-size: 24px; font-weight: 700; }
  .header .sub { font-size: 13px; opacity: 0.8; margin-top: 4px; }
  .body { padding: 28px 32px; }
  .section { margin-bottom: 28px; }
  .section-title { font-family:'Sora',sans-serif; font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#0B1437; margin-bottom:10px; padding-bottom:4px; border-bottom:2px solid #0B1437; }
  .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:20px; }
  .kpi { border:1px solid #eee; border-radius:6px; padding:14px; }
  .kpi .label { font-size:10px; color:#6C757D; font-weight:700; text-transform:uppercase; }
  .kpi .value { font-size:20px; font-weight:700; font-family:'Sora',sans-serif; margin-top:4px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  thead th { background:#E6E7E8; padding:7px 10px; text-align:left; font-family:'Sora',sans-serif; font-size:10px; font-weight:700; text-transform:uppercase; color:#0B1437; }
  thead th:last-child,thead th:nth-child(n+2) { text-align:right; }
  .footer { padding: 16px 32px; border-top:1px solid #eee; font-size:10px; color:#6C757D; display:flex; justify-content:space-between; }
  .compliance-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
</style>
</head>
<body>

<!-- Cover -->
<div class="header">
  <h1>${data.tenantName}</h1>
  <div class="sub">Monthly Board Pack — ${data.period}</div>
  <div class="sub" style="margin-top:8px;opacity:0.6;">Generated ${new Date(data.generatedAt).toLocaleString("en-KE")}</div>
</div>

<div class="body">

  <!-- 1. Portfolio KPIs -->
  <div class="section">
    <div class="section-title">Portfolio Performance</div>
    <div class="kpi-grid">
      <div class="kpi">
        <div class="label">Portfolio MLR</div>
        <div class="value" style="color:${mlrColor(data.portfolio.mlr)}">${pct(data.portfolio.mlr)}</div>
      </div>
      <div class="kpi">
        <div class="label">Trailing 12-Month MLR</div>
        <div class="value" style="color:${mlrColor(data.portfolio.trailing12Mlr)}">${pct(data.portfolio.trailing12Mlr)}</div>
      </div>
      <div class="kpi">
        <div class="label">Contribution YTD</div>
        <div class="value" style="color:#0B1437">${fmt(data.portfolio.contributionYtd)}</div>
      </div>
      <div class="kpi">
        <div class="label">New Members</div>
        <div class="value" style="color:#28A745">${data.membership.newMemberCount.toLocaleString()}</div>
      </div>
    </div>
  </div>

  <!-- 2. Scheme Grid -->
  <div class="section">
    <div class="section-title">Scheme Performance</div>
    <table>
      <thead><tr><th>Scheme</th><th>Members</th><th>MLR</th><th>Contribution</th></tr></thead>
      <tbody>${schemeRows}</tbody>
    </table>
  </div>

  <!-- 3. Top ICD Drivers -->
  <div class="section page-break">
    <div class="section-title">Top Diagnosis Drivers (by Cost)</div>
    <table>
      <thead><tr><th>ICD-10 Code</th><th>Encounters</th><th>Total Cost</th></tr></thead>
      <tbody>${icdRows}</tbody>
    </table>
  </div>

  <!-- 4. Provider Performance -->
  <div class="section">
    <div class="section-title">Provider Performance</div>
    <table>
      <thead><tr><th>Provider</th><th>Type</th><th>Encounters</th><th>Avg Cost</th><th>PA Approval</th></tr></thead>
      <tbody>${providerRows}</tbody>
    </table>
  </div>

  <!-- 5. Compliance Metrics -->
  <div class="section">
    <div class="section-title">Compliance & Risk Metrics</div>
    <div class="compliance-grid">
      <div class="kpi">
        <div class="label">Override Requests</div>
        <div class="value" style="color:${data.compliance.overrideCount > 20 ? "#DC3545" : "#0B1437"}">${data.compliance.overrideCount}</div>
      </div>
      <div class="kpi">
        <div class="label">Fraud Alerts</div>
        <div class="value" style="color:${data.compliance.fraudAlertCount > 0 ? "#DC3545" : "#28A745"}">${data.compliance.fraudAlertCount}</div>
      </div>
      <div class="kpi">
        <div class="label">Members Lapsed</div>
        <div class="value" style="color:${data.membership.lapsedCount > 0 ? "#856404" : "#28A745"}">${data.membership.lapsedCount}</div>
      </div>
      <div class="kpi">
        <div class="label">New Enrolments</div>
        <div class="value" style="color:#28A745">${data.membership.newMemberCount}</div>
      </div>
    </div>
  </div>

</div>

<div class="footer">
  <span>${data.tenantName} — Confidential. For board use only.</span>
  <span>${data.period} Monthly Board Pack</span>
</div>

</body>
</html>`;
}
