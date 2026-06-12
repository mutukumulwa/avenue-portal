import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle, XCircle, Clock, Users, FileText, AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  acceptQuotationAction,
  createMembershipsAction,
  approveBinderAction,
  postDebitNoteAction,
} from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

const STEP_STYLE = {
  done:    "bg-[#28A745]/10 border-[#28A745]/30 text-[#28A745]",
  active:  "bg-avenue-indigo/10 border-avenue-indigo/30 text-avenue-indigo",
  blocked: "bg-[#F8F9FA] border-[#EEEEEE] text-avenue-text-muted",
};

export default async function BindPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const quotation = await prisma.quotation.findUnique({
    where: { id, tenantId },
    include: {
      acceptance: { include: { acceptedBy: { select: { firstName: true, lastName: true } } } },
      broker: { select: { name: true } },
    },
  });
  if (!quotation) notFound();

  // Members created from this quotation
  const members = await prisma.member.findMany({
    where: { quotationId: id, tenantId },
    select: {
      id: true, memberNumber: true, firstName: true, lastName: true,
      relationship: true, status: true, coverStartDate: true,
      bindingMakerId: true, bindingCheckerId: true,
    },
    orderBy: [{ relationship: "asc" }, { lastName: "asc" }],
  });

  // Invoice posted?
  const invoice = quotation.groupId
    ? await prisma.invoice.findFirst({
        where: { tenantId, groupId: quotation.groupId },
        orderBy: { createdAt: "desc" },
        select: { id: true, invoiceNumber: true, totalAmount: true, status: true },
      })
    : null;

  const isAccepted      = quotation.status === "ACCEPTED" || !!quotation.acceptance;
  const hasMemberships  = members.length > 0;
  const binderApproved  = hasMemberships && members.every((m) => !!m.bindingCheckerId);
  const debitNotePosted = !!invoice;

  const userId = session.user.id;
  const isMaker   = hasMemberships && members[0].bindingMakerId === userId;
  const isChecker = !isMaker; // same user can't be both

  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/quotations/${id}`} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-avenue-text-heading font-heading">
            Binding — {quotation.quoteNumber}
          </h1>
          <p className="text-sm text-avenue-text-muted mt-0.5">
            {quotation.legalName ?? quotation.prospectName ?? "—"} · status: {quotation.status}
          </p>
        </div>
      </div>

      {/* Progress steps */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "1. Acceptance",    done: isAccepted     },
          { label: "2. Create Members",done: hasMemberships },
          { label: "3. Approve Binder",done: binderApproved },
          { label: "4. Debit Note",    done: debitNotePosted },
        ].map(({ label, done }, i) => {
          const isNext = !done && [isAccepted, hasMemberships, binderApproved][i - 1] === true || (i === 0 && !done);
          const style = done ? STEP_STYLE.done : isNext ? STEP_STYLE.active : STEP_STYLE.blocked;
          return (
            <div key={label} className={`border rounded-[8px] p-3 flex items-center gap-2 ${style}`}>
              {done
                ? <CheckCircle size={16} />
                : <Clock size={16} className="opacity-60" />}
              <span className="text-xs font-semibold">{label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Acceptance ─────────────────────────────────────── */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-avenue-text-heading text-sm flex items-center gap-2">
            {isAccepted ? <CheckCircle size={16} className="text-[#28A745]" /> : <Clock size={16} className="text-avenue-text-muted" />}
            Step 1 — Quote Acceptance
          </h2>
          {isAccepted && quotation.acceptance && (
            <span className="text-xs text-avenue-text-muted">
              Accepted {new Date(quotation.acceptance.acceptedAt).toLocaleDateString("en-KE")} by{" "}
              {quotation.acceptance.acceptedBy.firstName} {quotation.acceptance.acceptedBy.lastName}{" "}
              via <strong>{quotation.acceptance.method.replace("_", " ")}</strong>
            </span>
          )}
        </div>

        {!isAccepted && quotation.status === "SENT" && (
          <form action={acceptQuotationAction} className="space-y-3">
            <input type="hidden" name="quotationId" value={id} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Method of acceptance</label>
                <select name="method"
                  className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-avenue-indigo focus:outline-none">
                  <option value="PORTAL_CLICK">Portal click</option>
                  <option value="EMAIL_REPLY">Email reply</option>
                  <option value="SIGNED_LETTER">Signed letter (upload required)</option>
                  <option value="PAYMENT_INITIATED">Payment initiated</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-avenue-text-muted mb-1">Document URL (signed letter)</label>
                <input name="documentUrl" type="url" placeholder="https://…"
                  className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end">
              <SubmitButton
                className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors">
                Record Acceptance
              </SubmitButton>
            </div>
          </form>
        )}

        {!isAccepted && quotation.status !== "SENT" && (
          <p className="text-sm text-avenue-text-muted">
            Quotation must be in <strong>SENT</strong> status. Current status: <strong>{quotation.status}</strong>.{" "}
            <Link href={`/quotations/${id}/build`} className="text-avenue-indigo hover:underline">Build and issue the quotation first.</Link>
          </p>
        )}
      </div>

      {/* ── Step 2: Create memberships ─────────────────────────────── */}
      <div className={`bg-white border rounded-[8px] shadow-sm p-5 space-y-4 ${!isAccepted ? "opacity-50 pointer-events-none" : "border-[#EEEEEE]"}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-avenue-text-heading text-sm flex items-center gap-2">
            {hasMemberships ? <CheckCircle size={16} className="text-[#28A745]" /> : <Users size={16} className="text-avenue-text-muted" />}
            Step 2 — Create Membership Records
          </h2>
          {hasMemberships && (
            <span className="text-xs text-[#28A745] font-semibold">{members.length} member{members.length !== 1 ? "s" : ""} created</span>
          )}
        </div>

        {!hasMemberships && isAccepted && (
          <div className="space-y-3">
            <p className="text-sm text-avenue-text-muted">
              This will create <strong>{quotation.memberCount + quotation.dependentCount}</strong> member record(s) in{" "}
              <span className="font-mono text-xs bg-[#FFC107]/10 text-[#856404] px-1.5 py-0.5 rounded">PENDING_ACTIVATION</span>{" "}
              carrying over all underwriting decisions, exclusions, and waiting periods.
            </p>
            <form action={createMembershipsAction}>
              <input type="hidden" name="quotationId" value={id} />
              <SubmitButton className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors">
                Create Memberships
              </SubmitButton>
            </form>
          </div>
        )}

        {hasMemberships && (
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-[#E6E7E8] text-xs text-[#6C757D] font-semibold">
                <th className="px-4 py-2">Member No.</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Cover Start</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Binder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-avenue-indigo">
                    <Link href={`/members/${m.id}`} className="hover:underline">{m.memberNumber}</Link>
                  </td>
                  <td className="px-4 py-2 font-semibold text-avenue-text-heading">{m.firstName} {m.lastName}</td>
                  <td className="px-4 py-2 text-avenue-text-muted capitalize">{m.relationship.toLowerCase()}</td>
                  <td className="px-4 py-2 text-avenue-text-muted">
                    {m.coverStartDate ? new Date(m.coverStartDate).toLocaleDateString("en-KE") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FFC107]/10 text-[#856404]">
                      {m.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-avenue-text-muted">
                    {m.bindingCheckerId
                      ? <span className="text-[#28A745] font-semibold">✓ Approved</span>
                      : m.bindingMakerId
                      ? <span className="text-[#856404]">Pending checker</span>
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Step 3: Approve binder ─────────────────────────────────── */}
      <div className={`bg-white border rounded-[8px] shadow-sm p-5 space-y-4 ${!hasMemberships ? "opacity-50 pointer-events-none" : "border-[#EEEEEE]"}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-avenue-text-heading text-sm flex items-center gap-2">
            {binderApproved ? <CheckCircle size={16} className="text-[#28A745]" /> : <FileText size={16} className="text-avenue-text-muted" />}
            Step 3 — Binder Approval (Maker-Checker)
          </h2>
        </div>

        {hasMemberships && !binderApproved && (
          <div className="space-y-3">
            {isMaker ? (
              <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[8px] p-3 flex items-start gap-2">
                <AlertTriangle size={15} className="text-[#856404] mt-0.5 shrink-0" />
                <p className="text-xs text-[#856404]">
                  You created these memberships. A <strong>different user</strong> with{" "}
                  <strong>QUOTATION:APPROVE_BINDER</strong> permission must approve the binder.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-avenue-text-muted">
                  Review and approve the binder to make memberships eligible for activation on cover start date.
                  You are acting as the <strong>checker</strong>.
                </p>
                <form action={approveBinderAction}>
                  <input type="hidden" name="quotationId" value={id} />
                  <SubmitButton
                    className="bg-[#28A745] hover:bg-[#218838] text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2">
                    <CheckCircle size={15} /> Approve Binder
                  </SubmitButton>
                </form>
              </div>
            )}
          </div>
        )}

        {binderApproved && (
          <p className="text-sm text-[#28A745] font-semibold flex items-center gap-2">
            <CheckCircle size={15} /> Binder approved. Members will activate automatically on cover start date.
          </p>
        )}
      </div>

      {/* ── Step 4: Debit note ─────────────────────────────────────── */}
      <div className={`bg-white border rounded-[8px] shadow-sm p-5 space-y-4 ${!binderApproved ? "opacity-50 pointer-events-none" : "border-[#EEEEEE]"}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-avenue-text-heading text-sm flex items-center gap-2">
            {debitNotePosted ? <CheckCircle size={16} className="text-[#28A745]" /> : <FileText size={16} className="text-avenue-text-muted" />}
            Step 4 — Post Debit Note
          </h2>
          {invoice && (
            <span className="text-xs text-avenue-text-muted">
              {invoice.invoiceNumber} · {fmt(Number(invoice.totalAmount))} · {invoice.status}
            </span>
          )}
        </div>

        {binderApproved && !debitNotePosted && (
          <div className="space-y-2">
            <p className="text-sm text-avenue-text-muted">
              Post the first-year debit note for{" "}
              <strong>{fmt(Number(quotation.finalPremium ?? 0))}</strong>.
            </p>
            <form action={postDebitNoteAction}>
              <input type="hidden" name="quotationId" value={id} />
              <SubmitButton
                className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors">
                Post Debit Note
              </SubmitButton>
            </form>
          </div>
        )}

        {debitNotePosted && (
          <p className="text-sm text-[#28A745] font-semibold flex items-center gap-2">
            <CheckCircle size={15} /> Debit note posted.{" "}
            <Link href={`/billing`} className="text-avenue-indigo hover:underline font-normal">View in Billing</Link>
          </p>
        )}
      </div>
    </div>
  );
}
