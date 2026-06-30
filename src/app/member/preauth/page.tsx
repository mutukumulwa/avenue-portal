import { requireRole, ROLES } from "@/lib/rbac";
import { MemberPreAuthService } from "@/server/services/member-preauth.service";
import { CalendarClock, ChevronRight, PlusCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

const currency = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

function statusTone(status: string) {
  switch (status) {
    case "APPROVED":
    case "CONVERTED_TO_CLAIM":
      return "border-[#28A745]/25 bg-[#28A745]/10 text-[#1F7A34]";
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "border-[#17A2B8]/25 bg-[#17A2B8]/10 text-[#0F6F7D]";
    case "DECLINED":
    case "CANCELLED":
      return "border-[#DC3545]/25 bg-[#DC3545]/10 text-[#B02A37]";
    default:
      return "border-[#6C757D]/25 bg-[#6C757D]/10 text-[#495057]";
  }
}

function nextStep(status: string) {
  switch (status) {
    case "APPROVED":
      return "Show this approval at the facility before service.";
    case "UNDER_REVIEW":
    case "SUBMITTED":
      return "A care reviewer is checking the request.";
    case "DECLINED":
      return "Review the reason and contact support if the care is still needed.";
    case "CONVERTED_TO_CLAIM":
      return "This approval has already been matched to a care event.";
    case "EXPIRED":
      return "Request a fresh approval if the service is still planned.";
    default:
      return "Open the request for the latest status.";
  }
}

export default async function MemberPreauthPage() {
  const session = await requireRole(ROLES.MEMBER);
  const preauths = await MemberPreAuthService.getHistory(session.user.id, session.user.tenantId);

  if (!preauths) redirect("/login");

  return (
    <div className="space-y-6 font-ui">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-brand-text-muted">Member approvals</p>
          <h1 className="mt-1 text-2xl font-bold text-brand-text-heading">Pre-Authorizations</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-text-muted">
            Request approval before planned care and track decisions for you and your dependants.
          </p>
        </div>
        <Link
          href="/member/preauth/new"
          className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-brand-indigo px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-indigo-hover"
        >
          <PlusCircle className="h-4 w-4" />
          Request pre-auth
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-brand-text-muted">
            <ShieldCheck className="h-4 w-4" />
            <p className="text-xs font-bold uppercase">Approved</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-text-heading">
            {preauths.filter((item) => item.status === "APPROVED").length}
          </p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-brand-text-muted">
            <CalendarClock className="h-4 w-4" />
            <p className="text-xs font-bold uppercase">In review</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-text-heading">
            {preauths.filter((item) => item.status === "SUBMITTED" || item.status === "UNDER_REVIEW").length}
          </p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-brand-text-muted">Requested value</p>
          <p className="mt-2 text-2xl font-bold text-brand-text-heading">
            {currency.format(preauths.reduce((sum, item) => sum + item.estimatedCost, 0))}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {preauths.map((preauth) => (
          <Link
            key={preauth.id}
            href={`/member/preauth/${preauth.id}`}
            className="block rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm transition-colors hover:border-brand-indigo/35"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs text-brand-text-muted">{preauth.preauthNumber}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase ${statusTone(preauth.status)}`}>
                    {preauth.status.replace(/_/g, " ")}
                  </span>
                </div>
                <h2 className="mt-2 text-base font-bold text-brand-text-heading">{preauth.providerName}</h2>
                <p className="mt-1 text-sm text-brand-text-muted">
                  {preauth.memberName} · {preauth.serviceType.replace(/_/g, " ")} · {preauth.benefitCategory.replace(/_/g, " ")}
                </p>
                <p className="mt-2 text-sm text-brand-text-body">{nextStep(preauth.status)}</p>
              </div>
              <div className="flex items-end justify-between gap-4 sm:block sm:text-right">
                <div>
                  <p className="text-xs font-bold uppercase text-brand-text-muted">Estimate</p>
                  <p className="mt-1 font-bold text-brand-text-heading">{currency.format(preauth.estimatedCost)}</p>
                  {preauth.approvedAmount !== null && (
                    <p className="mt-1 text-xs text-[#1F7A34]">Approved {currency.format(preauth.approvedAmount)}</p>
                  )}
                  <p className="mt-1 text-xs text-brand-text-muted">
                    {preauth.expectedDateOfService
                      ? new Date(preauth.expectedDateOfService).toLocaleDateString("en-KE")
                      : "Date to be confirmed"}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-brand-text-muted sm:ml-auto sm:mt-3" />
              </div>
            </div>
          </Link>
        ))}

        {preauths.length === 0 && (
          <div className="rounded-[8px] border border-dashed border-[#D6DCE5] bg-white p-8 text-center shadow-sm">
            <h2 className="text-base font-bold text-brand-text-heading">No pre-authorizations yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-brand-text-muted">
              Start a request before planned care and the portal will show whether it can be approved immediately or needs review.
            </p>
            <Link
              href="/member/preauth/new"
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-[8px] bg-brand-indigo px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-indigo-hover"
            >
              <PlusCircle className="h-4 w-4" />
              Request pre-auth
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
