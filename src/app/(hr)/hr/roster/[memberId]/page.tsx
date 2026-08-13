import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User as UserIcon, Calendar, Info, Phone, Mail, FileText, ShieldCheck, Wallet, UserMinus, Clock } from "lucide-react";
import { evaluateEligibility, memberBenefitSummary } from "@/server/services/eligibility/evaluator";

export default async function HRMemberDetailPage(
  props: { params: Promise<{ memberId: string }> }
) {
  const params = await props.params;
  const session = await requireRole(ROLES.HR);

  // N3 (PRIVACY-S1-B): a `groupId!` non-null assertion is a lie for SUPER_ADMIN
  // (which is in ROLES.HR) or any ungrouped HR user — Prisma drops an undefined
  // key, so the query would degrade to a cross-group AND cross-tenant findFirst
  // that renders DOB / idNumber / phone / email. Guard the null case, and scope
  // by tenantId too. notFound() is called at top level, never inside try/catch.
  if (!session.user.groupId) notFound();

  const member = await prisma.member.findFirst({
    where: {
      id: params.memberId,
      tenantId: session.user.tenantId,
      groupId: session.user.groupId,
    },
    include: {
      group: true,
      package: true,
      benefitTier: true,
      dependents: true,
      principal: true,
      endorsements: {
         orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!member) notFound();

  // SP-6: the member is confirmed in the HR user's own group above (N3 guard) —
  // the eligibility verdict + balances come from the SINGLE evaluator (own-group
  // projection), never a re-computed status check, so HR sees the SAME numbers as
  // admin / member / provider.
  const [eligibility, balances, openLeaverRequest] = await Promise.all([
    evaluateEligibility({ tenantId: session.user.tenantId, memberRef: member.memberNumber }),
    memberBenefitSummary(member.id),
    // P08.01: an undecided leaver request for THIS member. Offering "Report
    // leaving" again would let one departure produce two pro-rata credits.
    prisma.endorsement.findFirst({
      where: {
        tenantId: session.user.tenantId,
        groupId: session.user.groupId,
        type: "MEMBER_DELETION",
        status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
        changeDetails: { path: ["memberId"], equals: member.id },
      },
      select: { id: true, status: true },
    }),
  ]);
  const eligBadge =
    eligibility.conclusion === "ELIGIBLE"
      ? "bg-[#28A745]/10 text-[#28A745]"
      : eligibility.conclusion === "MEMBER_ELIGIBLE_BENEFIT_BLOCKED"
        ? "bg-[#FFC107]/10 text-[#856404]"
        : "bg-[#DC3545]/10 text-[#DC3545]";
  const money = (n: number | null) => (n == null ? "—" : `UGX ${n.toLocaleString("en-UG")}`);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-[#28A745]/10 text-[#28A745]";
      case "SUSPENDED": return "bg-[#FFC107]/10 text-[#856404]";
      case "LAPSED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default: return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/hr/roster" className="text-brand-text-muted hover:text-brand-text-heading transition-colors" aria-label="Back to roster">
          <ArrowLeft size={24} />
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{member.firstName} {member.lastName}</h1>
            <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${getStatusBadge(member.status)}`}>
               {member.status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-brand-text-body font-body mt-1">Member #{member.memberNumber}</p>
        </div>

        {/* UAT-HF P08.01 (DEF-004) — the lifecycle action the HR portal had
            nowhere. The run found "the member detail page /hr/roster/<id>
            exposes only 'View All Endorsements' and no lifecycle action", while
            the endorsement list advertised a Member Deletion FILTER with no
            creation path behind it. Only offered on an ACTIVE member, and only
            when no request is already in flight — a control that is going to be
            refused is worse than no control (DEF-058's lesson). */}
        {member.status === "ACTIVE" && (
          <div className="ml-auto text-right">
            {openLeaverRequest ? (
              <Link
                href={`/hr/endorsements/${openLeaverRequest.id}`}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#856404] bg-[#FFC107]/10 border border-[#FFC107]/40 px-4 py-2 rounded-full hover:bg-[#FFC107]/20 transition-colors"
              >
                <Clock size={14} />
                Leaver request {openLeaverRequest.status.replace(/_/g, " ").toLowerCase()}
              </Link>
            ) : (
              <Link
                href={`/hr/roster/${member.id}/leaver`}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#DC3545] border border-[#DC3545] px-4 py-2 rounded-full hover:bg-[#DC3545]/10 transition-colors"
              >
                <UserMinus size={14} />
                Report leaving
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
             <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
                <UserIcon className="w-5 h-5 text-brand-indigo mr-2" />
                <h2 className="font-bold text-brand-text-heading font-heading">Personal Details</h2>
             </div>
             <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <div className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-1">Full Name</div>
                  <div className="font-semibold text-brand-text-heading">{member.firstName} {member.otherNames} {member.lastName}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-1">Gender</div>
                  <div className="font-semibold text-brand-text-heading">{member.gender}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-1">Date of Birth</div>
                  <div className="font-semibold text-brand-text-heading">{new Date(member.dateOfBirth).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-1">National ID</div>
                  <div className="font-semibold text-brand-text-heading">{member.idNumber || "—"}</div>
                </div>
                <div className="flex items-center">
                   <Phone className="w-4 h-4 text-[#848E9F] mr-2" />
                   <span className="font-semibold text-brand-text-heading">{member.phone || "—"}</span>
                </div>
                <div className="flex items-center">
                   <Mail className="w-4 h-4 text-[#848E9F] mr-2" />
                   <span className="font-semibold text-brand-text-heading">{member.email || "—"}</span>
                </div>
             </div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
             <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
                <Info className="w-5 h-5 text-brand-indigo mr-2" />
                <h2 className="font-bold text-brand-text-heading font-heading">Coverage Details</h2>
             </div>
             <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <div className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-1">Package</div>
                  <div className="font-semibold text-brand-text-heading">{member.package.name}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-1">Benefit Tier</div>
                  <div className="font-semibold text-brand-text-heading">{member.benefitTier?.name || "Standard"}</div>
                </div>
                <div>
                  <div className="text-xs font-bold text-brand-text-muted uppercase tracking-wider mb-1">Relationship</div>
                  <div className="font-semibold text-brand-text-heading uppercase text-sm">
                     {member.relationship}
                     {member.principal && ` to ${member.principal.firstName} ${member.principal.lastName}`}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                     <Calendar className="w-3.5 h-3.5 text-brand-text-muted" />
                     <div className="text-xs font-bold text-brand-text-muted uppercase tracking-wider">Enrolled Date</div>
                  </div>
                  <div className="font-semibold text-brand-text-heading">{new Date(member.enrollmentDate).toLocaleDateString()}</div>
                </div>
             </div>
          </div>

          {/* SP-6 Eligibility & Balances (own-group projection of the single evaluator) */}
          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
             <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
                <ShieldCheck className="w-5 h-5 text-brand-indigo mr-2" />
                <h2 className="font-bold text-brand-text-heading font-heading">Eligibility &amp; Balances</h2>
             </div>
             <div className="p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                   <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${eligBadge}`}>
                      {eligibility.conclusion.replace(/_/g, " ")}
                   </span>
                   <span className="text-xs font-semibold text-brand-text-muted uppercase tracking-wider">{eligibility.reasonCode.replace(/_/g, " ")}</span>
                   <span className="text-xs text-brand-text-muted">as of today</span>
                </div>
                {eligibility.explanations.length > 0 && (
                   <p className="text-xs text-brand-text-body">{eligibility.explanations[0]}</p>
                )}
                <div className="grid grid-cols-3 gap-3">
                   <div className="rounded-lg bg-[#F8F9FA] p-3">
                      <div className="text-[10px] font-bold uppercase text-brand-text-muted tracking-wider">Annual Limit</div>
                      <div className="font-bold text-brand-text-heading text-sm mt-0.5">{money(balances.totals.limit)}</div>
                   </div>
                   <div className="rounded-lg bg-[#F8F9FA] p-3">
                      <div className="text-[10px] font-bold uppercase text-brand-text-muted tracking-wider">Utilised{balances.totals.held > 0 ? ` (+${balances.totals.held.toLocaleString("en-UG")} held)` : ""}</div>
                      <div className="font-bold text-[#856404] text-sm mt-0.5">{money(balances.totals.used)}</div>
                   </div>
                   <div className="rounded-lg bg-[#F8F9FA] p-3">
                      <div className="text-[10px] font-bold uppercase text-brand-text-muted tracking-wider">Remaining</div>
                      <div className="font-bold text-[#28A745] text-sm mt-0.5">{money(balances.totals.remaining)}</div>
                   </div>
                </div>
                {balances.rows.length === 0 ? (
                   <p className="text-xs text-brand-text-muted italic">No pinned benefit schedule for this member.</p>
                ) : (
                   <div className="min-w-0 max-w-full overflow-x-auto">
                      <table className="w-full text-xs">
                         <thead>
                            <tr className="text-left text-brand-text-muted border-b border-[#EEEEEE]">
                               <th className="py-2 font-bold uppercase tracking-wider">Benefit</th>
                               <th className="py-2 font-bold uppercase tracking-wider text-right">Limit</th>
                               <th className="py-2 font-bold uppercase tracking-wider text-right">Used</th>
                               <th className="py-2 font-bold uppercase tracking-wider text-right">Remaining</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-[#EEEEEE]">
                            {balances.rows.map((r) => (
                               <tr key={r.category}>
                                  <td className="py-2 font-semibold text-brand-text-heading">{r.category.replace(/_/g, " ")}</td>
                                  <td className="py-2 text-right text-brand-text-body">{r.limit.toLocaleString("en-UG")}</td>
                                  <td className="py-2 text-right text-brand-text-body">{r.used.toLocaleString("en-UG")}</td>
                                  <td className="py-2 text-right font-semibold text-[#28A745]">{r.remaining.toLocaleString("en-UG")}</td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                )}
                <p className="text-[10px] text-brand-text-muted flex items-center gap-1">
                   <Wallet className="w-3 h-3" /> Point-in-time balances net of approved pre-authorisation holds. Not a guarantee of payment.
                </p>
             </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-6">
          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
            <div className="border-b border-[#EEEEEE] px-5 py-4">
              <h2 className="font-bold text-brand-text-heading font-heading flex justify-between items-center">
                 Related Dependants
                 <span className="bg-brand-indigo/10 text-brand-indigo text-xs px-2 py-0.5 rounded-full">{member.dependents.length}</span>
              </h2>
            </div>
            <div className="p-0">
               {member.dependents.length === 0 ? (
                  <div className="p-5 text-sm text-brand-text-body text-center">No dependants registered.</div>
               ) : (
                  <ul className="divide-y divide-[#EEEEEE]">
                     {member.dependents.map(d => (
                        <li key={d.id} className="p-4 flex justify-between items-center hover:bg-[#F8F9FA] transition-colors">
                           <div>
                              <Link href={`/hr/roster/${d.id}`} className="font-semibold text-sm text-brand-text-heading hover:text-brand-indigo transition-colors">
                                 {d.firstName} {d.lastName}
                              </Link>
                              <div className="text-xs text-brand-text-muted mt-0.5">{d.relationship}</div>
                           </div>
                           <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${getStatusBadge(d.status)}`}>
                             {d.status.replace("_", " ")}
                           </span>
                        </li>
                     ))}
                  </ul>
               )}
            </div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-2xl shadow-sm overflow-hidden">
            <div className="border-b border-[#EEEEEE] px-5 py-4 flex items-center">
               <FileText className="w-4 h-4 text-brand-indigo mr-2" />
               <h2 className="font-bold text-brand-text-heading font-heading">Request History</h2>
            </div>
            {member.endorsements.length === 0 ? (
               <div className="p-5 text-sm text-brand-text-body text-center">No history.</div>
            ) : (
               <ul className="divide-y divide-[#EEEEEE] p-0">
                 {member.endorsements.slice(0, 5).map(e => (
                   <li key={e.id} className="p-4">
                      <div className="flex justify-between items-start mb-1">
                         <span className="font-bold text-xs uppercase text-brand-text-heading">{e.type.replace(/_/g, " ")}</span>
                         <span className="text-[10px] font-bold uppercase text-brand-text-muted">{e.status}</span>
                      </div>
                      <div className="text-xs text-brand-text-body">{new Date(e.createdAt).toLocaleDateString()}</div>
                   </li>
                 ))}
               </ul>
            )}
            <div className="bg-[#F8F9FA] p-3 text-center border-t border-[#EEEEEE]">
               <Link href="/hr/endorsements" className="text-xs font-bold text-brand-indigo hover:text-brand-secondary transition-colors">View all requests</Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
