import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { bankReconciliationService } from "@/server/services/bank-reconciliation.service";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const rows    = await bankReconciliationService.parseStatement(buffer);
    const matches = await bankReconciliationService.reconcile(session.user.tenantId, rows);

    const exact     = matches.filter((m) => m.matchType === "EXACT_REF").length;
    const amount    = matches.filter((m) => m.matchType === "AMOUNT_REF").length;
    const unmatched = matches.filter((m) => m.matchType === "UNMATCHED").length;

    // Return an HTML page showing the results so the user can review and confirm
    const tenantId = session.user.tenantId;
    const html = buildResultsHtml(matches, { exact, amount, unmatched, tenantId });
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[reconcile]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Parse failed" }, { status: 400 });
  }
}

// POST for confirming a single match
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId, amount, reference, paymentDate } = await req.json() as {
    invoiceId: string; amount: number; reference: string; paymentDate: string;
  };

  await bankReconciliationService.postPayment(
    session.user.tenantId,
    invoiceId,
    amount,
    reference,
    session.user.id as string,
    new Date(paymentDate),
  );

  return NextResponse.json({ success: true });
}

function buildResultsHtml(
  matches: Awaited<ReturnType<typeof bankReconciliationService.reconcile>>,
  summary: { exact: number; amount: number; unmatched: number; tenantId: string },
): string {
  const matchIcon = (t: string) =>
    t === "EXACT_REF"  ? "✅" :
    t === "AMOUNT_REF" ? "⚠️" : "❌";
  const matchColor = (t: string) =>
    t === "EXACT_REF"  ? "#28A745" :
    t === "AMOUNT_REF" ? "#856404" : "#DC3545";

  const rows = matches.map((m) => `
    <tr style="border-bottom:1px solid #eee;">
      <td style="padding:7px 12px;font-size:12px;color:#6C757D;">${m.statementRow.date}</td>
      <td style="padding:7px 12px;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${m.statementRow.description}</td>
      <td style="padding:7px 12px;font-size:11px;font-family:monospace;">${m.statementRow.reference || "—"}</td>
      <td style="padding:7px 12px;text-align:right;font-family:monospace;font-size:12px;">KES ${m.statementRow.amount.toLocaleString("en-KE")}</td>
      <td style="padding:7px 12px;text-align:center;">${matchIcon(m.matchType)}</td>
      <td style="padding:7px 12px;font-size:12px;color:${matchColor(m.matchType)};">${m.groupName ?? "—"}<br/><span style="font-size:10px;font-family:monospace;">${m.matchedInvoiceNumber ?? ""}</span></td>
      <td style="padding:7px 12px;text-align:right;font-size:11px;color:${Math.abs(m.variance) > 1 ? "#DC3545" : "#28A745"};">
        ${m.variance !== 0 ? `KES ${m.variance.toLocaleString("en-KE")}` : "—"}
      </td>
      <td style="padding:7px 12px;">
        ${m.matchedInvoiceId ? `
          <button onclick="postPayment('${m.matchedInvoiceId}',${m.statementRow.amount},'${m.statementRow.reference}','${m.statementRow.date}')"
            style="background:#292A83;color:white;border:none;padding:4px 10px;border-radius:20px;font-size:11px;cursor:pointer;">
            Post
          </button>` : ""}
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head>
<title>Reconciliation Results</title>
<style>body{font-family:Lato,sans-serif;margin:0;padding:24px;color:#1a1a2e;} table{border-collapse:collapse;width:100%;} th{background:#E6E7E8;padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6C757D;}</style>
</head><body>
<div style="background:#292A83;color:white;padding:16px 24px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
  <div><h1 style="font-size:18px;margin:0;">Reconciliation Results</h1><p style="margin:4px 0 0;font-size:12px;opacity:.8;">${matches.length} transactions parsed</p></div>
  <div style="display:flex;gap:16px;text-align:center;font-size:12px;">
    <div><div style="font-size:22px;font-weight:700;">${summary.exact}</div><div>Exact Matches</div></div>
    <div><div style="font-size:22px;font-weight:700;">${summary.amount}</div><div>Amount Matches</div></div>
    <div><div style="font-size:22px;font-weight:700;color:#FFD700;">${summary.unmatched}</div><div>Unmatched</div></div>
  </div>
</div>
<p style="font-size:12px;color:#6C757D;margin-bottom:12px;">Review matches and click <strong>Post</strong> to record the payment against the matched invoice.</p>
<table>
  <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th style="text-align:right">Amount</th><th>Match</th><th>Invoice / Group</th><th style="text-align:right">Variance</th><th>Action</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div id="status" style="margin-top:16px;font-size:13px;color:#28A745;font-weight:600;"></div>
<script>
async function postPayment(invoiceId, amount, reference, date) {
  document.getElementById('status').textContent = 'Posting payment…';
  const res = await fetch('/api/billing/reconcile', {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({invoiceId, amount, reference, paymentDate: date}),
  });
  document.getElementById('status').textContent = res.ok ? 'Payment posted successfully.' : 'Error posting payment.';
}
</script>
</body></html>`;
}
