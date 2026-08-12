"use client";

import { useActionState } from "react";
import { Save, Lock } from "lucide-react";
import Link from "next/link";
import { updateMemberProfileAction, type ProfileUpdated } from "./actions";
import { isTerminalMemberStatus } from "@/lib/member-status";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { MutationOutcome } from "@/components/forms/MutationOutcome";
import { ConflictNotice } from "@/components/forms/ConflictNotice";
import { EXPECTED_UPDATED_AT_FIELD } from "@/lib/concurrency";
import { EXAMPLES } from "@/lib/locale-config";
import type { MutationResult } from "@/lib/mutation-contract";

/** Human labels for every MemberStatus (covers terminal states shown read-only). */
const STATUS_LABELS: Record<string, string> = {
  PENDING_ACTIVATION: "Pending Activation",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  LAPSED: "Lapsed",
  LAPSED_BEFORE_ACTIVATION: "Lapsed (before activation)",
  TERMINATED: "Terminated",
  CANCELLED_COOLING_OFF: "Cancelled (cooling-off)",
  TERMINATED_FRAUD: "Terminated (fraud)",
  TERMINATED_BREACH: "Terminated (breach)",
  TERMINATED_DEATH: "Terminated (death)",
  EXPIRED: "Expired",
};

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo transition-colors";
const labelCls = "text-xs font-bold text-brand-text-muted uppercase block mb-1";

interface MemberSnap {
  id: string;
  /** UAT-HF P05.05 — the precondition. What this copy of the record looked like. */
  updatedAt: string; // ISO
  firstName: string;
  lastName: string;
  otherNames: string | null;
  idNumber: string | null;
  dateOfBirth: string; // ISO
  gender: string;
  phone: string | null;
  email: string | null;
  relationship: string;
  status: string;
}

export function MemberEditForm({ member }: { member: MemberSnap }) {
  /**
   * UAT-HF P05.05 — DEF-077. The form now tells the server what it expected to
   * find (`__expectedUpdatedAt`) and what it was showing when it loaded
   * (`__original_*`). Without both, a save is either blind or writes the whole
   * stale record back over somebody else's committed change.
   */
  const boundAction = updateMemberProfileAction.bind(null, member.id);
  const [state, action, pending] = useActionState<MutationResult<ProfileUpdated> | null, FormData>(
    boundAction,
    null,
  );
  const failure = state && !state.ok ? state : null;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      <ErrorSummary failure={failure} />

      {/* Both operators' values, side by side — a rejected save must not be a
          second act of destruction. */}
      <ConflictNotice conflict={failure?.conflict} />

      <div className="mb-5">
        <MutationOutcome result={state} nextHref={`/members/${member.id}`} />
      </div>

      <form action={action} className="space-y-6">
        {/* The precondition, and the copy this browser loaded. */}
        <input type="hidden" name={EXPECTED_UPDATED_AT_FIELD} value={member.updatedAt} />
        <input type="hidden" name="__original_firstName" value={member.firstName} />
        <input type="hidden" name="__original_lastName" value={member.lastName} />
        <input type="hidden" name="__original_otherNames" value={member.otherNames ?? ""} />
        <input type="hidden" name="__original_idNumber" value={member.idNumber ?? ""} />
        <input type="hidden" name="__original_dateOfBirth" value={member.dateOfBirth.slice(0, 10)} />
        <input type="hidden" name="__original_gender" value={member.gender} />
        <input type="hidden" name="__original_phone" value={member.phone ?? ""} />
        <input type="hidden" name="__original_email" value={member.email ?? ""} />
        <input type="hidden" name="__original_relationship" value={member.relationship} />
        {/* Personal */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>First Name *</label>
              <input required name="firstName" type="text" defaultValue={member.firstName} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last Name *</label>
              <input required name="lastName" type="text" defaultValue={member.lastName} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Other Names</label>
              <input name="otherNames" type="text" defaultValue={member.otherNames ?? ""} placeholder="Middle name(s)" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date of Birth *</label>
              <input required name="dateOfBirth" type="date" defaultValue={member.dateOfBirth.slice(0, 10)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Gender *</label>
              <select required name="gender" defaultValue={member.gender} className={inputCls}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>National ID / Passport</label>
              <input name="idNumber" type="text" defaultValue={member.idNumber ?? ""} placeholder="e.g. 12345678" className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">Must be unique across all members.</p>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone Number</label>
              <input name="phone" type="text" defaultValue={member.phone ?? ""} placeholder={EXAMPLES.phone} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email Address</label>
              <input name="email" type="email" defaultValue={member.email ?? ""} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Policy */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Policy</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Relationship *</label>
              <select required name="relationship" defaultValue={member.relationship} className={inputCls}>
                <option value="PRINCIPAL">Principal</option>
                <option value="SPOUSE">Spouse</option>
                <option value="CHILD">Child</option>
                <option value="PARENT">Parent</option>
                <option value="SIBLING">Sibling</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              {/*
                UAT-HF P05.05 — DEF-041/DEF-043. Status used to be an ordinary
                dropdown submitted with the rest of the form, so suspending a
                member carried exactly the ceremony and audit weight of fixing a
                typo. It is now READ-ONLY here and changed by its own command,
                which requires a reason. The action does not read `status` from
                this form at all, so a forged field has nothing to bind to.
              */}
              <div className={`${inputCls} bg-[#F8F9FA] text-brand-text-muted flex items-center gap-2`}>
                <Lock size={13} className="shrink-0" />
                {STATUS_LABELS[member.status] ?? member.status}
              </div>
              <p className="text-[10px] text-brand-text-muted mt-1">
                {isTerminalMemberStatus(member.status)
                  ? "Terminal state — reinstatement is a governed lifecycle flow, not an edit."
                  : "Changing status is a separate, recorded decision."}{" "}
                <Link href={`/members/${member.id}`} className="underline">
                  Member lifecycle actions
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          {/* DEF-008's sibling: an edit form needs a labelled way out too. */}
          <Link
            href={`/members/${member.id}`}
            className="rounded-full border border-[#EEEEEE] px-5 py-2 text-sm font-semibold text-brand-text-muted transition-colors hover:bg-[#F8F9FA]"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {pending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
