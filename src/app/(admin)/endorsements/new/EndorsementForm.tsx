"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Calculator, AlertCircle } from "lucide-react";
import { submitEndorsementAction } from "./actions";

type Group   = { id: string; name: string; contributionRate: number; renewalDate: string };
type Package = { id: string; name: string; annualLimit: number; contributionAmount: number };
type Member  = { id: string; name: string; groupId: string; relationship: string };

type EndorsementType =
  | "MEMBER_ADDITION"
  | "MEMBER_DELETION"
  | "DEPENDENT_ADDITION"
  | "DEPENDENT_DELETION"
  | "PACKAGE_UPGRADE"
  | "PACKAGE_DOWNGRADE"
  | "BENEFIT_MODIFICATION"
  | "GROUP_DATA_CHANGE"
  | "SALARY_CHANGE"
  | "CORRECTION";

const TYPE_LABELS: Record<EndorsementType, string> = {
  MEMBER_ADDITION:     "Member Addition — new principal joins mid-term",
  MEMBER_DELETION:     "Member Deletion — principal exits mid-term",
  DEPENDENT_ADDITION:  "Dependent Addition — new dependent on existing principal",
  DEPENDENT_DELETION:  "Dependent Deletion — dependent removed",
  PACKAGE_UPGRADE:     "Package Upgrade — group moves to higher plan",
  PACKAGE_DOWNGRADE:   "Package Downgrade — group moves to lower plan",
  BENEFIT_MODIFICATION:"Benefit Modification — add/remove a benefit rider",
  GROUP_DATA_CHANGE:   "Group Data Change — contact info / payment terms",
  SALARY_CHANGE:       "Salary Change — contribution recalculation",
  CORRECTION:          "Correction — administrative error fix",
};

// Which types trigger a pro-rata financial impact
const HAS_PRORATA = new Set<EndorsementType>([
  "MEMBER_ADDITION","MEMBER_DELETION","DEPENDENT_ADDITION","DEPENDENT_DELETION",
  "PACKAGE_UPGRADE","PACKAGE_DOWNGRADE","SALARY_CHANGE",
]);

function inputCls() {
  return "w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm text-avenue-text-heading focus:ring-2 focus:ring-avenue-indigo focus:border-avenue-indigo outline-none transition-all bg-white";
}
function labelCls() { return "block text-xs font-bold text-avenue-text-muted uppercase mb-1"; }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls()}>{label}</label>{children}</div>;
}

export function EndorsementForm({
  groups, packages, members, preselectedGroupId,
}: {
  groups: Group[];
  packages: Package[];
  members: Member[];
  preselectedGroupId: string | null;
}) {
  const [groupId, setGroupId]   = useState(preselectedGroupId ?? groups[0]?.id ?? "");
  const [type, setType]         = useState<EndorsementType>("MEMBER_ADDITION");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedGroup = useMemo(() => groups.find(g => g.id === groupId), [groups, groupId]);
  const groupMemberList = useMemo(() => members.filter(m => m.groupId === groupId), [members, groupId]);
  const principals = useMemo(() => groupMemberList.filter(m => m.relationship === "PRINCIPAL"), [groupMemberList]);

  // Pro-rata preview
  const proRata = useMemo(() => {
    if (!selectedGroup || !effectiveDate || !HAS_PRORATA.has(type)) return null;
    const renewal = new Date(selectedGroup.renewalDate);
    const effective = new Date(effectiveDate);
    const daysRemaining = Math.max(0, Math.ceil((renewal.getTime() - effective.getTime()) / 86400000));
    const daily = selectedGroup.contributionRate / 365;
    const amount = daily * daysRemaining;
    const isCredit = type === "MEMBER_DELETION" || type === "DEPENDENT_DELETION" || type === "PACKAGE_DOWNGRADE";
    return { amount: Math.round(amount), daysRemaining, isCredit };
  }, [selectedGroup, effectiveDate, type]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    await submitEndorsementAction(fd);
  }

  const statusColors: Record<string, string> = {
    DRAFT:        "bg-[#6C757D]/10 text-[#6C757D]",
    SUBMITTED:    "bg-[#17A2B8]/10 text-[#17A2B8]",
    UNDER_REVIEW: "bg-[#FFC107]/10 text-[#856404]",
    APPROVED:     "bg-[#28A745]/10 text-[#28A745]",
    REJECTED:     "bg-[#DC3545]/10 text-[#DC3545]",
    APPLIED:      "bg-avenue-indigo/10 text-avenue-indigo",
    CANCELLED:    "bg-[#6C757D]/10 text-[#6C757D]",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/endorsements" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">New Endorsement</h1>
          <p className="text-avenue-text-muted text-sm mt-0.5">Submit a mid-term policy change for review and pro-rata calculation.</p>
        </div>
      </div>

      {/* Status legend */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
        <p className="text-xs font-bold text-avenue-text-muted uppercase mb-2">Endorsement Status Flow</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(statusColors).map(([s, cls]) => (
            <span key={s} className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cls}`}>
              {s.replace(/_/g, " ")}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-avenue-text-muted mt-2">
          DRAFT → SUBMITTED → UNDER REVIEW → APPROVED → APPLIED &nbsp;|&nbsp; Can be REJECTED or CANCELLED at any point.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Scope ─────────────────────────────────────── */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
            Endorsement Scope
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Target Group">
              <select
                name="groupId"
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                className={inputCls()}
                required
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Endorsement Type">
              <select
                name="type"
                value={type}
                onChange={e => setType(e.target.value as EndorsementType)}
                className={inputCls()}
                required
              >
                {(Object.entries(TYPE_LABELS) as [EndorsementType, string][]).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </Field>

            <Field label="Effective Date">
              <input
                name="effectiveDate"
                type="date"
                value={effectiveDate}
                onChange={e => setEffectiveDate(e.target.value)}
                className={inputCls()}
                required
              />
            </Field>

            {selectedGroup && (
              <div className="flex flex-col justify-end">
                <p className={labelCls()}>Policy Renewal</p>
                <p className="text-sm font-semibold text-avenue-text-heading">
                  {new Date(selectedGroup.renewalDate).toLocaleDateString("en-KE")}
                </p>
                <p className="text-xs text-avenue-text-muted">
                  Rate: KES {selectedGroup.contributionRate.toLocaleString()} / member / yr
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Pro-rata preview ───────────────────────────── */}
        {proRata && (
          <div className={`rounded-[8px] p-4 border flex items-start gap-3 ${
            proRata.isCredit
              ? "bg-[#28A745]/5 border-[#28A745]/20"
              : "bg-avenue-indigo/5 border-avenue-indigo/20"
          }`}>
            <Calculator size={18} className={proRata.isCredit ? "text-[#28A745] mt-0.5" : "text-avenue-indigo mt-0.5"} />
            <div>
              <p className="text-sm font-bold text-avenue-text-heading">
                Pro-Rata {proRata.isCredit ? "Credit" : "Charge"}: KES {proRata.amount.toLocaleString()}
              </p>
              <p className="text-xs text-avenue-text-muted mt-0.5">
                {proRata.daysRemaining} days remaining × KES {(selectedGroup!.contributionRate / 365).toFixed(2)}/day.
                {proRata.isCredit ? " This amount will be credited to the group's next invoice." : " This amount will be added to the group's next invoice."}
              </p>
            </div>
          </div>
        )}

        {/* ── Type-specific fields ───────────────────────── */}
        {(type === "MEMBER_ADDITION") && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              New Member Details
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="First Name"><input name="firstName" type="text" className={inputCls()} required /></Field>
              <Field label="Last Name"><input name="lastName" type="text" className={inputCls()} required /></Field>
              <Field label="Date of Birth"><input name="dateOfBirth" type="date" className={inputCls()} required /></Field>
              <Field label="Gender">
                <select name="gender" className={inputCls()} required>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              <Field label="ID / Passport No."><input name="idNumber" type="text" className={inputCls()} /></Field>
              <Field label="Relationship">
                <select name="relationship" className={inputCls()} required>
                  <option value="PRINCIPAL">Principal</option>
                  <option value="SPOUSE">Spouse</option>
                  <option value="CHILD">Child</option>
                </select>
              </Field>
              <Field label="Phone"><input name="phone" type="tel" className={inputCls()} /></Field>
              <Field label="Email"><input name="email" type="email" className={inputCls()} /></Field>
            </div>
          </div>
        )}

        {(type === "MEMBER_DELETION") && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              Member Exit Details
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Member to Remove">
                <select name="memberId" className={inputCls()} required>
                  <option value="">— Select member —</option>
                  {groupMemberList.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reason for Exit">
                <select name="reason" className={inputCls()} required>
                  <option value="Resignation">Resignation</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Termination">Termination</option>
                  <option value="Death">Death</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
              <Field label="Last Day of Cover">
                <input name="lastDay" type="date" className={inputCls()} required />
              </Field>
              <Field label="Refund Eligible">
                <select name="refundEligible" className={inputCls()}>
                  <option value="YES">Yes — prorate refund to group</option>
                  <option value="NO">No</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {(type === "DEPENDENT_ADDITION") && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              Dependent Addition Details
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Principal Member">
                <select name="memberId" className={inputCls()} required>
                  <option value="">— Select principal —</option>
                  {principals.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Dependent Relationship">
                <select name="relationship" className={inputCls()} required>
                  <option value="SPOUSE">Spouse</option>
                  <option value="CHILD">Child</option>
                </select>
              </Field>
              <Field label="First Name"><input name="firstName" type="text" className={inputCls()} required /></Field>
              <Field label="Last Name"><input name="lastName" type="text" className={inputCls()} required /></Field>
              <Field label="Date of Birth"><input name="dateOfBirth" type="date" className={inputCls()} required /></Field>
              <Field label="Gender">
                <select name="gender" className={inputCls()} required>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {(type === "DEPENDENT_DELETION") && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              Dependent Removal Details
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Principal Member">
                <select name="memberId" className={inputCls()} required>
                  <option value="">— Select principal —</option>
                  {principals.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Dependent Member to Remove">
                <select name="dependentId" className={inputCls()} required>
                  <option value="">— Select dependent —</option>
                  {groupMemberList.filter(m => m.relationship !== "PRINCIPAL").map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reason">
                <select name="reason" className={inputCls()}>
                  <option value="Divorce">Divorce</option>
                  <option value="Over age limit">Over age limit</option>
                  <option value="Death">Death</option>
                  <option value="Other">Other</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {(type === "PACKAGE_UPGRADE" || type === "PACKAGE_DOWNGRADE") && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              Package Change Details
            </h2>
            {selectedGroup && (
              <div className="bg-[#F8F9FA] rounded-[8px] p-3 text-sm">
                <p className="text-avenue-text-muted text-xs font-bold uppercase mb-1">Current Package</p>
                <p className="font-semibold text-avenue-text-heading">Rate: KES {selectedGroup.contributionRate.toLocaleString()} / member / yr</p>
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-4">
              <Field label={type === "PACKAGE_UPGRADE" ? "Upgrade To" : "Downgrade To"}>
                <select name="newPackageId" className={inputCls()} required>
                  <option value="">— Select new package —</option>
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — KES {p.contributionAmount.toLocaleString()}/yr
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Reason / Justification">
                <input name="reason" type="text" className={inputCls()} placeholder="e.g. Annual salary review" />
              </Field>
            </div>
          </div>
        )}

        {type === "BENEFIT_MODIFICATION" && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              Benefit Modification Details
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Modification Type">
                <select name="modificationType" className={inputCls()} required>
                  <option value="ADD_RIDER">Add Benefit Rider</option>
                  <option value="REMOVE_RIDER">Remove Benefit Rider</option>
                  <option value="INCREASE_LIMIT">Increase Sub-Limit</option>
                  <option value="DECREASE_LIMIT">Decrease Sub-Limit</option>
                </select>
              </Field>
              <Field label="Benefit Category">
                <select name="benefitCategory" className={inputCls()} required>
                  {["MATERNITY","DENTAL","OPTICAL","MENTAL_HEALTH","CHRONIC_DISEASE","WELLNESS_PREVENTIVE","REHABILITATION"].map(c => (
                    <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </Field>
              <Field label="New Sub-Limit (KES)">
                <input name="newLimit" type="number" min="0" className={inputCls()} placeholder="0" />
              </Field>
              <Field label="Notes">
                <input name="notes" type="text" className={inputCls()} placeholder="Board resolution ref, etc." />
              </Field>
            </div>
          </div>
        )}

        {type === "GROUP_DATA_CHANGE" && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              Updated Group Details
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="New Contact Person Name">
                <input name="contactPersonName" type="text" className={inputCls()} />
              </Field>
              <Field label="New Contact Phone">
                <input name="contactPersonPhone" type="tel" className={inputCls()} />
              </Field>
              <Field label="New Contact Email">
                <input name="contactPersonEmail" type="email" className={inputCls()} />
              </Field>
              <Field label="New Payment Frequency">
                <select name="paymentFrequency" className={inputCls()}>
                  <option value="">— No change —</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </Field>
              <Field label="New Address" >
                <input name="address" type="text" className={inputCls()} />
              </Field>
            </div>
          </div>
        )}

        {type === "SALARY_CHANGE" && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              Salary / Contribution Change
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Affected Member">
                <select name="memberId" className={inputCls()} required>
                  <option value="">— Select member —</option>
                  {groupMemberList.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Old Annual Salary (KES)">
                <input name="oldSalary" type="number" min="0" className={inputCls()} required />
              </Field>
              <Field label="New Annual Salary (KES)">
                <input name="newSalary" type="number" min="0" className={inputCls()} required />
              </Field>
              <Field label="New Annual Contribution (KES)">
                <input name="newContribution" type="number" min="0" className={inputCls()} required />
              </Field>
            </div>
          </div>
        )}

        {type === "CORRECTION" && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
              Correction Details
            </h2>
            <div className="flex items-start gap-2 bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[8px] p-3">
              <AlertCircle size={15} className="text-[#856404] mt-0.5 shrink-0" />
              <p className="text-xs text-[#856404]">
                Corrections are administrative fixes only and do not trigger financial recalculation. Both the old and new values must be documented.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Affected Member (if applicable)">
                <select name="memberId" className={inputCls()}>
                  <option value="">— Group-level correction —</option>
                  {groupMemberList.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Field Being Corrected">
                <input name="fieldName" type="text" className={inputCls()} placeholder="e.g. Date of Birth" required />
              </Field>
              <Field label="Old (Incorrect) Value">
                <input name="oldValue" type="text" className={inputCls()} required />
              </Field>
              <Field label="New (Correct) Value">
                <input name="newValue" type="text" className={inputCls()} required />
              </Field>
              <Field label="Supporting Document Reference">
                <input name="docRef" type="text" className={inputCls()} placeholder="e.g. HR letter dated 2025-03-15" />
              </Field>
            </div>
          </div>
        )}

        {/* ── Notes ────────────────────────────────────── */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2">
            Additional Notes
          </h2>
          <textarea
            name="notes"
            rows={3}
            placeholder="Any context, HR approval references, or special instructions…"
            className={`${inputCls()} resize-none`}
          />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/endorsements"
            className="px-5 py-2.5 text-sm font-semibold text-avenue-text-muted hover:text-avenue-text-heading transition-colors">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-8 py-2.5 rounded-full font-bold text-sm transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <Save size={15} />
            {submitting ? "Submitting…" : "Submit for Review"}
          </button>
        </div>
      </form>
    </div>
  );
}
