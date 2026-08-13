"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Save, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateMemberProfileAction, type ProfileUpdated } from "./actions";
import { isTerminalMemberStatus } from "@/lib/member-status";
import { ErrorSummary } from "@/components/forms/ErrorSummary";
import { MutationOutcome } from "@/components/forms/MutationOutcome";
import { ConflictNotice } from "@/components/forms/ConflictNotice";
import { EXPECTED_UPDATED_AT_FIELD, EXPECTED_VERSION_FIELD } from "@/lib/concurrency";
import { EXAMPLES } from "@/lib/locale-config";
import type { MutationResult } from "@/lib/mutation-contract";
import { useDirtyFormGuard } from "@/components/forms/useDirtyFormGuard";
import { MEMBER_ADDRESS_COUNTRY } from "@/lib/member-address";

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
  /** P05.01 — monotonic row version, so same-millisecond saves still conflict. */
  version: number;
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
  addressCountry: string;
  addressDistrict: string;
  addressLocality: string;
  addressSubcounty: string;
  addressParish: string;
  addressVillage: string;
  addressLine: string;
  addressLatitude: string;
  addressLongitude: string;
  addressCoordinateConsent: string;
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
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [coordinateConsent, setCoordinateConsent] = useState(
    member.addressCoordinateConsent === "on",
  );
  const { confirmDiscard } = useDirtyFormGuard(isDirty);

  useEffect(() => {
    // A successful Server Action establishes a new clean baseline for this
    // mounted form; without this reset, leaving after Save still warns that the
    // just-saved values are unsaved.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize local dirty state with the terminal server mutation
    if (state?.ok) setIsDirty(false);
  }, [state]);

  const onInput = useCallback(() => {
    setIsDirty(true);
    const form = formRef.current;
    if (form) setCoordinateConsent(new FormData(form).get("addressCoordinateConsent") === "on");
  }, []);

  const cancel = useCallback(() => {
    if (!confirmDiscard()) return;
    setIsDirty(false);
    router.push(`/members/${member.id}`);
  }, [confirmDiscard, member.id, router]);

  const errorFor = (field: string) => failure?.fieldErrors?.[field]?.[0];
  const a11y = (field: string) => ({
    id: field,
    "aria-invalid": !!errorFor(field),
    "aria-describedby": errorFor(field) ? `${field}-error` : undefined,
  });
  const inlineError = (field: string) =>
    errorFor(field) ? (
      <p id={`${field}-error`} role="alert" className="mt-1 text-xs text-brand-error">
        {errorFor(field)}
      </p>
    ) : null;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      <ErrorSummary failure={failure} />

      {/* Both operators' values, side by side — a rejected save must not be a
          second act of destruction. */}
      <ConflictNotice conflict={failure?.conflict} />

      <div className="mb-5">
        <MutationOutcome result={state} nextHref={`/members/${member.id}`} />
      </div>

      <form ref={formRef} action={action} onInput={onInput} onChange={onInput} className="space-y-6">
        {/* The precondition, and the copy this browser loaded. */}
        <input type="hidden" name={EXPECTED_UPDATED_AT_FIELD} value={member.updatedAt} />
        {/* P05.01: `updatedAt` alone is millisecond-granular, so two saves
            inside one millisecond both pass it. The row version is monotonic. */}
        <input type="hidden" name={EXPECTED_VERSION_FIELD} value={member.version} />
        <input type="hidden" name="__original_firstName" value={member.firstName} />
        <input type="hidden" name="__original_lastName" value={member.lastName} />
        <input type="hidden" name="__original_otherNames" value={member.otherNames ?? ""} />
        <input type="hidden" name="__original_idNumber" value={member.idNumber ?? ""} />
        <input type="hidden" name="__original_dateOfBirth" value={member.dateOfBirth.slice(0, 10)} />
        <input type="hidden" name="__original_gender" value={member.gender} />
        <input type="hidden" name="__original_phone" value={member.phone ?? ""} />
        <input type="hidden" name="__original_email" value={member.email ?? ""} />
        <input type="hidden" name="__original_relationship" value={member.relationship} />
        <input type="hidden" name="__original_addressCountry" value={member.addressCountry} />
        <input type="hidden" name="__original_addressDistrict" value={member.addressDistrict} />
        <input type="hidden" name="__original_addressLocality" value={member.addressLocality} />
        <input type="hidden" name="__original_addressSubcounty" value={member.addressSubcounty} />
        <input type="hidden" name="__original_addressParish" value={member.addressParish} />
        <input type="hidden" name="__original_addressVillage" value={member.addressVillage} />
        <input type="hidden" name="__original_addressLine" value={member.addressLine} />
        <input type="hidden" name="__original_addressLatitude" value={member.addressLatitude} />
        <input type="hidden" name="__original_addressLongitude" value={member.addressLongitude} />
        <input type="hidden" name="__original_addressCoordinateConsent" value={member.addressCoordinateConsent} />
        {/* Personal */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className={labelCls}>First Name *</label>
              <input {...a11y("firstName")} required name="firstName" type="text" defaultValue={member.firstName} className={inputCls} />
              {inlineError("firstName")}
            </div>
            <div>
              <label htmlFor="lastName" className={labelCls}>Last Name *</label>
              <input {...a11y("lastName")} required name="lastName" type="text" defaultValue={member.lastName} className={inputCls} />
              {inlineError("lastName")}
            </div>
            <div className="col-span-2">
              <label htmlFor="otherNames" className={labelCls}>Other Names</label>
              <input {...a11y("otherNames")} name="otherNames" type="text" defaultValue={member.otherNames ?? ""} placeholder="Middle name(s)" className={inputCls} />
              {inlineError("otherNames")}
            </div>
            <div>
              <label htmlFor="dateOfBirth" className={labelCls}>Date of Birth *</label>
              <input {...a11y("dateOfBirth")} required name="dateOfBirth" type="date" defaultValue={member.dateOfBirth.slice(0, 10)} className={inputCls} />
              {inlineError("dateOfBirth")}
            </div>
            <div>
              <label htmlFor="gender" className={labelCls}>Gender *</label>
              <select {...a11y("gender")} required name="gender" defaultValue={member.gender} className={inputCls}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
              {inlineError("gender")}
            </div>
            <div className="col-span-2">
              <label htmlFor="idNumber" className={labelCls}>National ID / Passport</label>
              <input {...a11y("idNumber")} name="idNumber" type="text" defaultValue={member.idNumber ?? ""} placeholder="e.g. 12345678" className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">Must be unique across all members.</p>
              {inlineError("idNumber")}
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className={labelCls}>Phone Number</label>
              <input {...a11y("phone")} name="phone" type="tel" defaultValue={member.phone ?? ""} placeholder={EXAMPLES.phone} className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">Uganda format: +256 772 555 042 or 0772 555 042.</p>
              {inlineError("phone")}
            </div>
            <div>
              <label htmlFor="email" className={labelCls}>Email Address</label>
              <input {...a11y("email")} name="email" type="email" defaultValue={member.email ?? ""} className={inputCls} />
              {inlineError("email")}
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Address</h3>
          <input type="hidden" name="addressCountry" value={MEMBER_ADDRESS_COUNTRY} />
          <p className="mb-3 text-xs text-brand-text-muted">Country: <strong>Uganda</strong></p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ["addressDistrict", "District", member.addressDistrict],
              ["addressLocality", "City / Municipality / County", member.addressLocality],
              ["addressSubcounty", "Subcounty / Division", member.addressSubcounty],
              ["addressParish", "Parish / Ward", member.addressParish],
              ["addressVillage", "Village / Zone", member.addressVillage],
              ["addressLine", "Building / Street / Landmark", member.addressLine],
            ] as const).map(([name, label, value]) => (
              <div key={name} className={name === "addressLine" ? "md:col-span-2" : undefined}>
                <label htmlFor={name} className={labelCls}>{label}</label>
                <input {...a11y(name)} name={name} defaultValue={value} maxLength={name === "addressLine" ? 200 : 100} className={inputCls} />
                {inlineError(name)}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-[#EEEEEE] bg-[#F8F9FA] p-4 space-y-3">
            <label htmlFor="addressCoordinateConsent" className="flex items-start gap-2 text-sm text-brand-text-heading">
              <input
                {...a11y("addressCoordinateConsent")}
                name="addressCoordinateConsent"
                type="checkbox"
                defaultChecked={member.addressCoordinateConsent === "on"}
                className="mt-1"
              />
              <span>I confirm the member consented to storing precise coordinates for authorized location-based workflows.</span>
            </label>
            {inlineError("addressCoordinateConsent")}
            {coordinateConsent && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="addressLatitude" className={labelCls}>Latitude *</label>
                  <input {...a11y("addressLatitude")} required name="addressLatitude" inputMode="decimal" defaultValue={member.addressLatitude} className={inputCls} />
                  {inlineError("addressLatitude")}
                </div>
                <div>
                  <label htmlFor="addressLongitude" className={labelCls}>Longitude *</label>
                  <input {...a11y("addressLongitude")} required name="addressLongitude" inputMode="decimal" defaultValue={member.addressLongitude} className={inputCls} />
                  {inlineError("addressLongitude")}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Policy */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Policy</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="relationship" className={labelCls}>Relationship *</label>
              <select {...a11y("relationship")} required name="relationship" defaultValue={member.relationship} className={inputCls}>
                {member.relationship === "PRINCIPAL" ? (
                  <option value="PRINCIPAL">Principal</option>
                ) : (
                  <>
                    <option value="SPOUSE">Spouse</option>
                    <option value="CHILD">Child</option>
                    <option value="PARENT">Parent</option>
                    <option value="SIBLING">Sibling</option>
                  </>
                )}
              </select>
              {inlineError("relationship")}
              <p className="text-[10px] text-brand-text-muted mt-1">
                Moving a member into or out of a family root needs a governed family correction; profile editing cannot break or invent that link.
              </p>
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
          <button
            type="button"
            onClick={cancel}
            className="rounded-full border border-[#EEEEEE] px-5 py-2 text-sm font-semibold text-brand-text-muted transition-colors hover:bg-[#F8F9FA]"
          >
            Cancel
          </button>
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
