/** UAT-HF P05.06 — exact calendar-day semantics for member enrolment. */
import {
  compareCalendarDates,
  differenceInCalendarDays,
  parseCalendarDate,
  todayCalendarDate,
  type CalendarDate,
} from "@/lib/calendar-date";

export interface MemberEnrolmentDateInput {
  dateOfBirth?: string | null;
  effectiveDate?: string | null;
  birthNotificationDate?: string | null;
  relationship?: string | null;
}

export type MemberEnrolmentDateResult =
  | {
      ok: true;
      value: {
        dateOfBirth: CalendarDate;
        requestedEffectiveDate: CalendarDate;
        birthNotificationDate: CalendarDate | null;
        coverStartDate: CalendarDate;
        newbornRuleApplied: boolean;
      };
    }
  | { ok: false; fieldErrors: Record<string, string[]> };

export function resolveMemberEnrolmentDates(
  input: MemberEnrolmentDateInput,
  today: CalendarDate = todayCalendarDate(),
): MemberEnrolmentDateResult {
  const errors: Record<string, string[]> = {};
  const dob = parseCalendarDate(input.dateOfBirth ?? "");
  const effective = parseCalendarDate(input.effectiveDate?.trim() || today);
  const notificationRaw = input.birthNotificationDate?.trim() ?? "";
  const notification = notificationRaw ? parseCalendarDate(notificationRaw) : null;

  if (!dob) errors.dateOfBirth = ["Enter a real date of birth in YYYY-MM-DD format."];
  if (!effective) errors.effectiveDate = ["Enter a real cover start in YYYY-MM-DD format."];
  if (notificationRaw && !notification) {
    errors.birthNotificationDate = ["Enter a real birth notification date in YYYY-MM-DD format."];
  }

  if (dob && compareCalendarDates(dob, today) > 0) {
    errors.dateOfBirth = ["Date of birth cannot be in the future."];
  }
  if (dob && effective && compareCalendarDates(dob, effective) > 0) {
    errors.effectiveDate = ["Cover cannot start before the member was born."];
  }
  if (notification && input.relationship !== "CHILD") {
    errors.birthNotificationDate = ["Birth notification date applies only to a child enrolment."];
  }
  if (notification && dob && compareCalendarDates(notification, dob) < 0) {
    errors.birthNotificationDate = ["Birth notification date cannot be before the date of birth."];
  }
  if (notification && compareCalendarDates(notification, today) > 0) {
    errors.birthNotificationDate = ["Birth notification date cannot be in the future."];
  }

  if (Object.keys(errors).length > 0 || !dob || !effective) {
    return { ok: false, fieldErrors: errors };
  }

  const notifiedAfterDays = notification ? differenceInCalendarDays(dob, notification) : null;
  const newbornRuleApplied =
    input.relationship === "CHILD" &&
    notification !== null &&
    notifiedAfterDays !== null &&
    notifiedAfterDays >= 0 &&
    notifiedAfterDays <= 30;

  return {
    ok: true,
    value: {
      dateOfBirth: dob,
      requestedEffectiveDate: effective,
      birthNotificationDate: notification,
      coverStartDate: newbornRuleApplied ? dob : effective,
      newbornRuleApplied,
    },
  };
}
