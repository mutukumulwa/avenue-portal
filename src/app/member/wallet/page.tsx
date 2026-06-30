import { requireRole, ROLES } from "@/lib/rbac";
import { MemberPaymentService } from "@/server/services/member-payment.service";
import { ArrowRight, CheckCircle2, Clock, ReceiptText, RefreshCcw, Smartphone, WalletCards } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PaymentInitiationForm } from "./PaymentInitiationForm";

const currency = new Intl.NumberFormat("en-UG", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

function formatDate(value: Date | null) {
  if (!value) return "Pending";
  return new Date(value).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" });
}

function statusTone(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "border-[#28A745]/25 bg-[#28A745]/10 text-[#1F7A34]";
    case "FAILED":
    case "TIMED_OUT":
    case "CANCELLED":
      return "border-[#DC3545]/25 bg-[#DC3545]/10 text-[#B02A37]";
    case "PENDING_CALLBACK":
    case "INITIATED":
      return "border-[#17A2B8]/25 bg-[#17A2B8]/10 text-[#0F6F7D]";
    default:
      return "border-[#6C757D]/25 bg-[#6C757D]/10 text-[#495057]";
  }
}

function paymentIsPending(status?: string) {
  return status === "INITIATED" || status === "PENDING_CALLBACK";
}

function paymentCanRetry(status?: string) {
  return !status || status === "FAILED" || status === "TIMED_OUT" || status === "CANCELLED";
}

export default async function MemberWalletPage() {
  const session = await requireRole(ROLES.MEMBER);
  const wallet = await MemberPaymentService.getWalletForUser(session.user.id, session.user.tenantId);

  if (!wallet) redirect("/login");

  return (
    <div className="space-y-6 font-ui">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-brand-text-muted">Member wallet</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-text-heading">M-Pesa Co-Contributions</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-text-muted">
            Pay confirmed member-share balances and track sandbox M-Pesa callbacks.
          </p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-brand-text-muted">
            <Smartphone className="h-4 w-4" />
            <p className="text-xs font-bold uppercase">Preferred phone</p>
          </div>
          <p className="mt-1 font-bold text-brand-text-heading">{wallet.viewer.preferredPhone ?? "Not set"}</p>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-brand-text-muted">
            <WalletCards className="h-4 w-4" />
            <p className="text-xs font-bold uppercase">Outstanding</p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-text-heading">
            {currency.format(wallet.summary.totalOutstanding)}
          </p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-brand-text-muted">
            <ReceiptText className="h-4 w-4" />
            <p className="text-xs font-bold uppercase">Open items</p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-text-heading">{wallet.summary.openItemCount}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-brand-text-muted">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-xs font-bold uppercase">Paid through wallet</p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[#1F7A34]">{currency.format(wallet.summary.totalPaid)}</p>
        </div>
      </section>

      <section className="rounded-[8px] border border-[#17A2B8]/25 bg-[#17A2B8]/5 p-4">
        <p className="text-sm font-bold text-brand-text-heading">Facility authorization rule</p>
        <p className="mt-1 text-sm text-brand-text-muted">
          Service should only be treated as paid after AiCare records a confirmed payment callback. A screenshot or SMS alone is not confirmation.
        </p>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Outstanding member share</h2>
          <p className="mt-1 text-sm text-brand-text-muted">Balances are created from adjudicated care events and cleared only after callback confirmation.</p>
        </div>

        {wallet.outstanding.map((item) => {
          const latestStatus = item.latestPayment?.status;
          const pending = paymentIsPending(latestStatus);
          const canRetry = paymentCanRetry(latestStatus);
          return (
            <article key={item.id} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs text-brand-text-muted">{item.claimNumber}</p>
                    <span className="rounded-full border border-[#EEEEEE] px-2.5 py-1 text-[10px] font-bold uppercase text-brand-text-muted">
                      {item.collectionStatus.replace(/_/g, " ")}
                    </span>
                    {latestStatus && (
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusTone(latestStatus)}`}>
                        {latestStatus.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-brand-text-heading">{item.providerName}</h3>
                  <p className="mt-1 text-sm text-brand-text-muted">
                    {item.memberName} · {item.serviceType.replace(/_/g, " ")} · {formatDate(item.dateOfService)}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-brand-text-muted">Due</p>
                      <p className="mt-1 font-bold tabular-nums text-brand-text-heading">{currency.format(item.amountDue)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-brand-text-muted">Total share</p>
                      <p className="mt-1 font-bold tabular-nums text-brand-text-heading">{currency.format(item.finalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase text-brand-text-muted">Collected</p>
                      <p className="mt-1 font-bold tabular-nums text-[#1F7A34]">{currency.format(item.amountCollected)}</p>
                    </div>
                  </div>
                  <Link href={`/member/utilization/${item.claimId}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-indigo hover:underline">
                    View care event <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div>
                  {pending && item.latestPayment ? (
                    <div className="rounded-[8px] border border-[#17A2B8]/25 bg-[#17A2B8]/5 p-4">
                      <div className="flex items-center gap-2 text-[#0F6F7D]">
                        <Clock className="h-4 w-4" />
                        <p className="text-sm font-bold">Awaiting callback</p>
                      </div>
                      <p className="mt-2 text-sm text-brand-text-muted">
                        Checkout {item.latestPayment.checkoutRequestId} expires at {new Date(item.latestPayment.expiresAt).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}.
                      </p>
                      <PaymentInitiationForm transactionId={item.id} defaultPhone={item.memberPhone ?? wallet.viewer.preferredPhone} disabled />
                    </div>
                  ) : (
                    <div className="rounded-[8px] border border-[#EEEEEE] bg-[#FAFBFD] p-4">
                      {latestStatus && !canRetry && (
                        <p className="mb-3 text-sm text-brand-text-muted">This item is waiting for the next payment update.</p>
                      )}
                      {latestStatus && canRetry && (
                        <div className="mb-3 flex items-center gap-2 text-[#B02A37]">
                          <RefreshCcw className="h-4 w-4" />
                          <p className="text-sm font-bold">Retry available</p>
                        </div>
                      )}
                      <PaymentInitiationForm transactionId={item.id} defaultPhone={item.memberPhone ?? wallet.viewer.preferredPhone} disabled={!canRetry} />
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {wallet.outstanding.length === 0 && (
          <div className="rounded-[8px] border border-dashed border-[#D6DCE5] bg-white p-8 text-center shadow-sm">
            <h3 className="text-base font-bold text-brand-text-heading">No outstanding member share</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm text-brand-text-muted">
              When a care event creates a co-contribution, it will appear here for M-Pesa collection.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Payment history</h2>
          <p className="mt-1 text-sm text-brand-text-muted">Recent sandbox checkout attempts and callback outcomes.</p>
        </div>
        <div className="overflow-hidden rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
          {wallet.payments.map((payment) => (
            <div key={payment.id} className="grid gap-3 border-b border-[#EEEEEE] p-4 last:border-b-0 md:grid-cols-[1.2fr_0.7fr_0.7fr]">
              <div>
                <p className="font-bold text-brand-text-heading">{payment.providerName}</p>
                <p className="mt-1 text-sm text-brand-text-muted">
                  {payment.memberName} · {payment.claimNumber} · {formatDate(payment.dateOfService)}
                </p>
                <p className="mt-1 font-mono text-xs text-brand-text-muted">{payment.checkoutRequestId}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-brand-text-muted">Amount</p>
                <p className="mt-1 font-bold tabular-nums text-brand-text-heading">{currency.format(payment.amount)}</p>
                <p className="mt-1 text-xs text-brand-text-muted">{payment.phoneNumber}</p>
              </div>
              <div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusTone(payment.status)}`}>
                  {payment.status.replace(/_/g, " ")}
                </span>
                <p className="mt-2 text-xs text-brand-text-muted">
                  {payment.mpesaReceipt ?? payment.resultDescription ?? `Requested ${formatDate(payment.requestedAt)}`}
                </p>
              </div>
            </div>
          ))}
          {wallet.payments.length === 0 && (
            <p className="p-6 text-center text-sm text-brand-text-muted">No wallet payment attempts yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
