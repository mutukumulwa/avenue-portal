import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { createContractAction } from "../actions";

export const dynamic = "force-dynamic";

const field = "rounded-lg border border-gray-200 px-3 py-2 text-sm w-full";
const label = "block text-xs font-medium text-[#6C757D] mb-1";

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; providerId?: string }>;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { error, providerId } = await searchParams;

  const providers = await prisma.provider.findMany({
    where: { tenantId: session.user.tenantId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/contracts" className="inline-flex items-center gap-1 text-sm text-[#6C757D] hover:text-[#06B9AB] mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to contracts
      </Link>
      <h1 className="text-2xl font-semibold text-[#000523] mb-1">New Contract</h1>
      <p className="text-sm text-[#6C757D] mb-6">Capture the core contract details. It starts as a DRAFT — add tariffs, applicability and branches, then submit for approval.</p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#DC3545]/10 px-4 py-3 text-sm text-[#DC3545]">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      <form action={createContractAction} className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#000523] mb-4">Identity & parties</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={label}>Provider *</label>
              <select name="providerId" defaultValue={providerId ?? ""} required className={field}>
                <option value="" disabled>Select provider…</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={label}>Title *</label>
              <input name="title" required placeholder="e.g. CIC Insurance Pricelist Agreement 2025" className={field} />
            </div>
            <div>
              <label className={label}>Contract type</label>
              <select name="contractType" defaultValue="RATE_SCHEDULE" className={field}>
                <option value="MASTER_SERVICE_AGREEMENT">Master Service Agreement</option>
                <option value="RATE_SCHEDULE">Rate Schedule</option>
                <option value="PACKAGE_AGREEMENT">Package Agreement</option>
                <option value="CASE_RATE_AGREEMENT">Case Rate Agreement</option>
                <option value="RECONCILIATION_AGREEMENT">Reconciliation Agreement</option>
                <option value="ADDENDUM">Addendum</option>
                <option value="GOVERNMENT_SCHEME_CONTRACT">Government Scheme Contract</option>
              </select>
            </div>
            <div>
              <label className={label}>External ref (e.g. SHA CN-73009)</label>
              <input name="externalContractRef" className={field} />
            </div>
            <div>
              <label className={label}>Branch scope</label>
              <select name="branchScope" defaultValue="ALL_BRANCHES" className={field}>
                <option value="ALL_BRANCHES">All branches</option>
                <option value="LISTED">Listed branches only</option>
              </select>
            </div>
            <div>
              <label className={label}>Execution status</label>
              <select name="executionStatus" defaultValue="UNSIGNED" className={field}>
                <option value="FULLY_EXECUTED">Fully executed</option>
                <option value="PROVIDER_ONLY">Provider only</option>
                <option value="UNSIGNED">Unsigned</option>
              </select>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#000523] mb-4">Effective window</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>Start date *</label>
              <input type="date" name="startDate" required className={field} />
            </div>
            <div>
              <label className={label}>End date *</label>
              <input type="date" name="endDate" required className={field} />
            </div>
            <div>
              <label className={label}>Review-due date</label>
              <input type="date" name="reviewDueDate" className={field} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-[#000523] mb-4">Commercial & operational terms</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>Currency</label>
              <input name="currency" defaultValue="KES" className={field} />
            </div>
            <div>
              <label className={label}>Payment term (days)</label>
              <input type="number" name="paymentTermDays" defaultValue={30} className={field} />
            </div>
            <div>
              <label className={label}>Payment term type</label>
              <select name="paymentTermType" defaultValue="CALENDAR" className={field}>
                <option value="CALENDAR">Calendar days</option>
                <option value="BUSINESS">Business days</option>
              </select>
            </div>
            <div>
              <label className={label}>Submission window (days)</label>
              <input type="number" name="submissionWindowDays" className={field} />
            </div>
            <div>
              <label className={label}>Submission window basis</label>
              <select name="submissionWindowBasis" defaultValue="" className={field}>
                <option value="">—</option>
                <option value="SERVICE_DATE">Service date</option>
                <option value="DISCHARGE_DATE">Discharge date</option>
                <option value="INVOICE_DATE">Invoice date</option>
                <option value="MONTHLY_BATCH">Monthly batch</option>
              </select>
            </div>
            <div>
              <label className={label}>Balance-billing policy</label>
              <select name="balanceBillingPolicy" defaultValue="" className={field}>
                <option value="">—</option>
                <option value="PROHIBITED">Prohibited</option>
                <option value="ALLOWED_NONCOVERED_WITH_CONSENT">Allowed (non-covered, with consent)</option>
                <option value="ALLOWED">Allowed</option>
              </select>
            </div>
            <div>
              <label className={label}>Tax inclusivity</label>
              <select name="taxInclusive" defaultValue="UNKNOWN" className={field}>
                <option value="INCLUSIVE">Inclusive</option>
                <option value="EXCLUSIVE">Exclusive</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </div>
            <div>
              <label className={label}>Reconciliation cadence</label>
              <select name="reconciliationCadence" defaultValue="NONE" className={field}>
                <option value="NONE">None</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="BIANNUAL">Biannual</option>
              </select>
            </div>
            <div>
              <label className={label}>Unlisted-service rule</label>
              <select name="unlistedServiceRule" defaultValue="REFER_FOR_REVIEW" className={field}>
                <option value="PAY_AS_BILLED">Pay as billed</option>
                <option value="DISCOUNT_OFF_BILLED">Discount off billed</option>
                <option value="REFER_FOR_REVIEW">Refer for review</option>
                <option value="REJECT">Reject</option>
              </select>
            </div>
            <div>
              <label className={label}>Unlisted discount %</label>
              <input type="number" step="0.01" name="unlistedDiscountPct" className={field} />
            </div>
            <div className="col-span-3">
              <label className={label}>Notes</label>
              <textarea name="notes" rows={2} className={field} />
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/contracts" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-[#6C757D] hover:bg-gray-50">Cancel</Link>
          <button type="submit" className="rounded-lg bg-[#06B9AB] px-5 py-2 text-sm font-medium text-white hover:bg-[#05a598]">Create draft</button>
        </div>
      </form>
    </div>
  );
}
