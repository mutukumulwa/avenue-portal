import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Download, FileText, ExternalLink } from "lucide-react";

export default async function HRInvoicesPage() {
  const session = await requireRole(ROLES.HR);
  const groupId = session.user.groupId;

  if (!groupId) {
    return <div className="p-8">No group assigned.</div>;
  }

  const invoices = await prisma.invoice.findMany({
    where: { groupId },
    orderBy: { createdAt: "desc" }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PAID": return "bg-[#28A745]/10 text-[#28A745]";
      case "PARTIALLY_PAID": return "bg-[#17A2B8]/10 text-[#17A2B8]";
      case "SENT": return "bg-[#FFC107]/10 text-[#856404]";
      case "OVERDUE": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Invoices</h1>
          <p className="text-avenue-text-body font-body mt-1">View your corporate billing history and outstanding balances.</p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-[#F8F9FA] border-b border-[#EEEEEE] text-avenue-text-muted font-heading text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">Invoice No.</th>
                <th className="px-6 py-4 font-bold">Period</th>
                <th className="px-6 py-4 font-bold text-right">Total Amount (KES)</th>
                <th className="px-6 py-4 font-bold text-right">Balance Due (KES)</th>
                <th className="px-6 py-4 font-bold">Due Date</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#F8F9FA] transition-colors group">
                  <td className="px-6 py-4">
                     <div className="font-mono text-avenue-text-heading font-bold flex items-center">
                        <FileText className="w-4 h-4 mr-2 text-avenue-indigo opacity-50" />
                        {inv.invoiceNumber}
                     </div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-avenue-text-heading">{inv.period}</td>
                  <td className="px-6 py-4 text-right font-semibold text-avenue-text-heading">
                     {Number(inv.totalAmount).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-avenue-indigo">
                     {(Number(inv.totalAmount) - Number(inv.paidAmount)).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-avenue-text-body">
                     {new Date(inv.dueDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                     <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${getStatusBadge(inv.status)}`}>
                        {inv.status.replace(/_/g, " ")}
                     </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3">
                     <button className="text-avenue-text-muted hover:text-avenue-indigo transition-colors" title="Download PDF">
                        <Download className="w-4 h-4" />
                     </button>
                     <button className="text-avenue-text-muted hover:text-avenue-indigo transition-colors" title="View Details">
                        <ExternalLink className="w-4 h-4" />
                     </button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-avenue-text-body">
                     No invoices issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
