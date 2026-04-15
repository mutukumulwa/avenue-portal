import { prisma } from "@/lib/prisma";
import { ArrowRight, Receipt, BookOpen } from "lucide-react";
import Link from "next/link";
import { sendInvoiceAction, recordPaymentAction } from "./actions";
import { requireRole, ROLES } from "@/lib/rbac";
import { NewInvoiceModal } from "./NewInvoiceModal";

export default async function BillingPage() {
  const session = await requireRole(ROLES.FINANCE);

  const tenantId = session.user.tenantId;

  const [invoices, payments, groups] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId },
      include: { group: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.payment.findMany({
      where: { group: { tenantId } },
      include: { group: { select: { name: true } } },
      orderBy: { paymentDate: "desc" },
      take: 20,
    }),
    prisma.group.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalBilled = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const totalCollected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
  const totalOutstanding = invoices
    .filter((i) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(i.status))
    .reduce((s, i) => s + Number(i.balance), 0);

  const statusColor = (status: string) => {
    switch (status) {
      case "PAID": return "bg-[#28A745]/10 text-[#28A745]";
      case "SENT": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "PARTIALLY_PAID": return "bg-[#FFC107]/10 text-[#FFC107]";
      case "OVERDUE": return "bg-[#DC3545]/10 text-[#DC3545]";
      case "DRAFT": return "bg-[#6C757D]/10 text-[#6C757D]";
      case "VOID": return "bg-[#E6E7E8] text-[#6C757D]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Billing & Finance</h1>
          <p className="text-avenue-text-body font-body mt-1">Manage invoices, payments, and collections.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/billing/gl"
            className="flex items-center gap-2 px-5 py-2 rounded-full border border-avenue-indigo text-avenue-indigo text-sm font-semibold hover:bg-avenue-indigo hover:text-white transition-colors"
          >
            <BookOpen size={15} /> General Ledger
          </Link>
          <NewInvoiceModal groups={groups} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Billed (KES)", value: totalBilled.toLocaleString(), color: "text-avenue-indigo" },
          { label: "Total Collected (KES)", value: totalCollected.toLocaleString(), color: "text-[#28A745]" },
          { label: "Outstanding (KES)", value: totalOutstanding.toLocaleString(), color: "text-[#DC3545]" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
            <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-avenue-text-heading font-heading">Invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-sm border-b border-[#EEEEEE]">
                <th className="px-6 py-4">Invoice No.</th>
                <th className="px-6 py-4">Group</th>
                <th className="px-6 py-4">Period</th>
                <th className="px-6 py-4">Members</th>
                <th className="px-6 py-4">Total (KES)</th>
                <th className="px-6 py-4">Balance (KES)</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body text-sm">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4 font-mono text-avenue-text-heading font-semibold">{inv.invoiceNumber}</td>
                  <td className="px-6 py-4 font-medium text-avenue-text-heading">{inv.group.name}</td>
                  <td className="px-6 py-4">{inv.period}</td>
                  <td className="px-6 py-4">{inv.memberCount}</td>
                  <td className="px-6 py-4 font-semibold">{Number(inv.totalAmount).toLocaleString()}</td>
                  <td className="px-6 py-4 font-semibold text-[#DC3545]">
                    {Number(inv.balance) > 0 ? Number(inv.balance).toLocaleString() : "—"}
                  </td>
                  <td className="px-6 py-4">{new Date(inv.dueDate).toLocaleDateString("en-KE")}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${statusColor(inv.status)}`}>
                      {inv.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {inv.status === "DRAFT" && (
                        <form action={sendInvoiceAction}>
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <button type="submit" className="text-xs font-bold px-3 py-1.5 rounded-full bg-avenue-indigo/10 text-avenue-indigo hover:bg-avenue-indigo hover:text-white transition-colors">
                            Send
                          </button>
                        </form>
                      )}
                      {["SENT","PARTIALLY_PAID","OVERDUE"].includes(inv.status) && (
                        <form action={recordPaymentAction} className="flex gap-1">
                          <input type="hidden" name="invoiceId"     value={inv.id} />
                          <input type="hidden" name="paymentDate"   value={new Date().toISOString().slice(0,10)} />
                          <input type="hidden" name="paymentMethod" value="BANK_TRANSFER" />
                          <input
                            name="amount"
                            type="number"
                            step="0.01"
                            defaultValue={Number(inv.balance)}
                            className="w-24 border border-[#EEEEEE] rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-avenue-indigo"
                          />
                          <button type="submit" className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#28A745]/10 text-[#28A745] hover:bg-[#28A745] hover:text-white transition-colors">
                            Pay
                          </button>
                        </form>
                      )}
                      <Link href={`/billing/gl/ledger?account=1100`} className="text-avenue-indigo hover:text-avenue-secondary font-semibold inline-flex items-center gap-1 text-sm">
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-avenue-text-body">
                    <Receipt size={32} className="mx-auto mb-3 text-[#DCDCDC]" />
                    No invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Payments */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-avenue-text-heading font-heading">Recent Payments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#E6E7E8] text-[#6C757D] font-semibold text-sm border-b border-[#EEEEEE]">
                <th className="px-6 py-4">Group</th>
                <th className="px-6 py-4">Amount (KES)</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body text-sm">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4 font-medium text-avenue-text-heading">{p.group.name}</td>
                  <td className="px-6 py-4 font-semibold text-[#28A745]">{Number(p.amount).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="bg-[#E6E7E8] text-[#6C757D] px-2 py-1 rounded text-xs font-bold">
                      {p.paymentMethod.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-sm">{p.referenceNumber ?? "—"}</td>
                  <td className="px-6 py-4">{new Date(p.paymentDate).toLocaleDateString("en-KE")}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-avenue-text-body">No payments recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
