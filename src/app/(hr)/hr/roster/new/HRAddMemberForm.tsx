"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { addMemberEndorsementAction } from "@/app/(hr)/hr/roster/new/actions";
import type { ActionState } from "@/app/(hr)/hr/roster/new/types";
import { Send, AlertCircle, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EXAMPLES } from "@/lib/locale-config";
import { MEMBER_ADDRESS_COUNTRY } from "@/lib/member-address";
import { calendarDateReadback, todayCalendarDate } from "@/lib/calendar-date";
import { resolveMemberEnrolmentDates } from "@/lib/member-enrolment";
import { useDirtyFormGuard } from "@/components/forms/useDirtyFormGuard";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo transition-colors";
const labelCls = "text-xs font-bold text-brand-text-muted uppercase block mb-1";

export function HRAddMemberForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addMemberEndorsementAction, null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [relationship, setRelationship] = useState("PRINCIPAL");
  const [dateValues, setDateValues] = useState<Record<string, string>>({ relationship: "PRINCIPAL" });
  const [coordinateConsent, setCoordinateConsent] = useState(false);
  const { confirmDiscard } = useDirtyFormGuard(isDirty);

  useEffect(() => {
    if (state?.error) errorRef.current?.focus();
  }, [state]);

  const onInput = useCallback(() => {
    setIsDirty(true);
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const values = Object.fromEntries(
      [...data.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    setRelationship(values.relationship ?? "PRINCIPAL");
    setDateValues(values);
    setCoordinateConsent(values.addressCoordinateConsent === "on");
  }, []);

  const cancel = useCallback(() => {
    if (!confirmDiscard()) return;
    setIsDirty(false);
    router.push("/hr/roster");
  }, [confirmDiscard, router]);

  const errorFor = (field: string) => state?.fieldErrors?.[field]?.[0];
  const a11y = (field: string) => ({
    id: field,
    "aria-invalid": !!errorFor(field),
    "aria-describedby": errorFor(field) ? `${field}-error` : undefined,
  });
  const inlineError = (field: string) =>
    errorFor(field) ? (
      <p id={`${field}-error`} role="alert" className="mt-1 text-xs text-brand-error">{errorFor(field)}</p>
    ) : null;
  const dateResolution = resolveMemberEnrolmentDates({
    dateOfBirth: dateValues.dateOfBirth,
    effectiveDate: dateValues.effectiveDate,
    birthNotificationDate: dateValues.birthNotificationDate,
    relationship: dateValues.relationship,
  });

  if (state?.success) {
    return (
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-8 text-center max-w-lg mx-auto mt-10">
        <div className="w-16 h-16 bg-[#28A745]/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-[#28A745]" />
        </div>
        <h2 className="text-xl font-bold text-brand-text-heading font-heading mb-2">Request Submitted</h2>
        <p className="text-sm text-brand-text-body mb-6">
          Your endorsement request <strong>{state.endorsementNumber}</strong> has been successfully submitted to Medvex for processing.
        </p>
        {state.resultingCoverStart && (
          <p className="mb-6 text-sm font-semibold text-brand-text-heading">
            {calendarDateReadback(state.resultingCoverStart, "Requested eligibility start after approval")}
          </p>
        )}
        <Link 
          href="/hr/endorsements" 
          className="inline-block px-6 py-2.5 bg-brand-indigo text-white font-semibold rounded-full hover:bg-brand-secondary transition-colors"
        >
          Track Endorsements
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      {state?.error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="mb-5 flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC3545]">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form ref={formRef} action={action} onInput={onInput} onChange={onInput} className="space-y-6">
        {/* Relationship */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Relationship</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="relationship" className={labelCls}>Role *</label>
              <select {...a11y("relationship")} required name="relationship" className={inputCls}>
                <option value="PRINCIPAL">Principal</option>
                <option value="SPOUSE">Spouse</option>
                <option value="CHILD">Child</option>
                <option value="PARENT">Parent</option>
                <option value="SIBLING">Sibling</option>
              </select>
              {inlineError("relationship")}
            </div>
            <div>
              <label htmlFor="effectiveDate" className={labelCls}>Effective Date *</label>
              <input {...a11y("effectiveDate")} required name="effectiveDate" type="date" className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">When this coverage should begin.</p>
              {inlineError("effectiveDate")}
            </div>
            {relationship !== "PRINCIPAL" && (
              <div className="col-span-2">
                <label htmlFor="principalIdNumber" className={labelCls}>Principal member National ID *</label>
                <input {...a11y("principalIdNumber")} required name="principalIdNumber" className={inputCls} />
                <p className="text-[10px] text-brand-text-muted mt-1">Used to attach this dependant to the correct family unit in your scheme.</p>
                {inlineError("principalIdNumber")}
              </div>
            )}
          </div>
        </div>

        {/* Personal Information */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="firstName" className={labelCls}>First Name *</label>
              <input {...a11y("firstName")} required name="firstName" type="text" placeholder="e.g. John" className={inputCls} />
              {inlineError("firstName")}
            </div>
            <div>
              <label htmlFor="lastName" className={labelCls}>Last Name *</label>
              <input {...a11y("lastName")} required name="lastName" type="text" placeholder="e.g. Doe" className={inputCls} />
              {inlineError("lastName")}
            </div>
            <div>
              <label htmlFor="dateOfBirth" className={labelCls}>Date of Birth *</label>
              <input {...a11y("dateOfBirth")} required name="dateOfBirth" type="date" className={inputCls} />
              {inlineError("dateOfBirth")}
            </div>
            <div>
              <label htmlFor="gender" className={labelCls}>Gender *</label>
              <select {...a11y("gender")} required name="gender" className={inputCls}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
              {inlineError("gender")}
            </div>
            <div className="col-span-2">
              <label htmlFor="idNumber" className={labelCls}>National ID / Passport</label>
              <input {...a11y("idNumber")} name="idNumber" type="text" placeholder="e.g. 12345678" className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">If the dependant is a child without an ID, leave this blank.</p>
              {inlineError("idNumber")}
            </div>
            <div className="col-span-2">
              <label htmlFor="birthNotificationDate" className={labelCls}>Birth Notification Date <span className="normal-case font-normal">(newborn children only)</span></label>
              <input {...a11y("birthNotificationDate")} name="birthNotificationDate" type="date" className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">If notified within 30 days, cover starts on the exact date of birth.</p>
              {inlineError("birthNotificationDate")}
            </div>
            {dateResolution.ok && (
              <div role="status" className="col-span-2 rounded-lg border border-brand-indigo/20 bg-brand-indigo/5 px-4 py-3 text-sm">
                <p>{calendarDateReadback(dateResolution.value.requestedEffectiveDate, "Requested cover start")}</p>
                <p className="font-semibold">{calendarDateReadback(dateResolution.value.coverStartDate, "Eligibility start if approved")}</p>
                <p className="mt-1 text-xs text-brand-text-muted">
                  {dateResolution.value.requestedEffectiveDate < todayCalendarDate()
                    ? "Back-dated request: the TPA must link an approved back-date override before this can be applied. Submitting this form does not change cover."
                    : dateResolution.value.requestedEffectiveDate > todayCalendarDate()
                      ? "Future-dated request: it remains submitted for TPA review and does not activate cover early."
                      : "This request remains submitted for TPA review. Cover does not change until approval."}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact Information <span className="font-normal text-brand-text-muted">(optional)</span></h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className={labelCls}>Phone Number</label>
              <input {...a11y("phone")} name="phone" type="tel" placeholder={EXAMPLES.phone} className={inputCls} />
              <p className="text-[10px] text-brand-text-muted mt-1">Uganda format: +256 772 555 042 or 0772 555 042.</p>
              {inlineError("phone")}
            </div>
            <div>
              <label htmlFor="email" className={labelCls}>Email Address</label>
              <input {...a11y("email")} name="email" type="email" placeholder="user@example.com" className={inputCls} />
              {inlineError("email")}
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Address <span className="font-normal text-brand-text-muted">(optional)</span></h3>
          <input type="hidden" name="addressCountry" value={MEMBER_ADDRESS_COUNTRY} />
          <p className="mb-3 text-xs text-brand-text-muted">Country: <strong>Uganda</strong></p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              ["addressDistrict", "District"],
              ["addressLocality", "City / Municipality / County"],
              ["addressSubcounty", "Subcounty / Division"],
              ["addressParish", "Parish / Ward"],
              ["addressVillage", "Village / Zone"],
              ["addressLine", "Building / Street / Landmark"],
            ] as const).map(([name, label]) => (
              <div key={name} className={name === "addressLine" ? "md:col-span-2" : undefined}>
                <label htmlFor={name} className={labelCls}>{label}</label>
                <input {...a11y(name)} name={name} maxLength={name === "addressLine" ? 200 : 100} className={inputCls} />
                {inlineError(name)}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-[#EEEEEE] bg-[#F8F9FA] p-4 space-y-3">
            <label htmlFor="addressCoordinateConsent" className="flex items-start gap-2 text-sm">
              <input {...a11y("addressCoordinateConsent")} name="addressCoordinateConsent" type="checkbox" className="mt-1" />
              <span>I confirm the member consented to storing precise coordinates for authorized location-based workflows.</span>
            </label>
            {inlineError("addressCoordinateConsent")}
            {coordinateConsent && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="addressLatitude" className={labelCls}>Latitude *</label>
                  <input {...a11y("addressLatitude")} required name="addressLatitude" inputMode="decimal" className={inputCls} />
                  {inlineError("addressLatitude")}
                </div>
                <div>
                  <label htmlFor="addressLongitude" className={labelCls}>Longitude *</label>
                  <input {...a11y("addressLongitude")} required name="addressLongitude" inputMode="decimal" className={inputCls} />
                  {inlineError("addressLongitude")}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Request Evidence</h3>
          <label htmlFor="sourceReference" className={labelCls}>HR letter / payroll instruction / document reference *</label>
          <input
            {...a11y("sourceReference")}
            required
            name="sourceReference"
            maxLength={120}
            placeholder="e.g. HR-LTR-2026-0042"
            className={inputCls}
          />
          <p className="text-[10px] text-brand-text-muted mt-1">The TPA reviewer uses this to verify the member-addition instruction before approval.</p>
          {inlineError("sourceReference")}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={cancel} className="rounded-full border border-[#EEEEEE] px-5 py-2 text-sm font-semibold text-brand-text-muted hover:bg-[#F8F9FA]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
            {pending ? "Submitting Request…" : "Submit Addition Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
