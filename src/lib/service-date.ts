/**
 * Service-date rules (PR-013).
 *
 * A date of service may never lie in the future for captured channels
 * (MANUAL / REIMBURSEMENT / BATCH / B2B). The boundary is "today" in the
 * tenant's operating timezone — Africa/Kampala (UTC+3, no DST) — so a claim
 * captured at 23:30 Kampala on date D is still D even when server UTC has
 * rolled past midnight.
 */

export const OPERATING_TZ_OFFSET_MINUTES = 3 * 60; // Africa/Kampala, fixed UTC+3

/** Calendar date (Y/M/D) of `d` as observed in the operating timezone. */
function operatingCalendarDate(d: Date): { y: number; m: number; day: number } {
  const shifted = new Date(d.getTime() + OPERATING_TZ_OFFSET_MINUTES * 60_000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), day: shifted.getUTCDate() };
}

/** True when `dateOfService` falls on a later operating-timezone calendar day than `now`. */
export function isFutureServiceDate(dateOfService: Date, now: Date = new Date()): boolean {
  const dos = operatingCalendarDate(dateOfService);
  const today = operatingCalendarDate(now);
  if (dos.y !== today.y) return dos.y > today.y;
  if (dos.m !== today.m) return dos.m > today.m;
  return dos.day > today.day;
}

export const FUTURE_SERVICE_DATE_ERROR =
  "Date of service cannot be in the future (operating timezone: Africa/Kampala).";

/** Throws when the date of service is in the future. Shared by every intake channel. */
export function assertServiceDateNotFuture(dateOfService: Date, now: Date = new Date()): void {
  if (isFutureServiceDate(dateOfService, now)) {
    throw new Error(FUTURE_SERVICE_DATE_ERROR);
  }
}

/** `max` attribute value for date inputs — today in the operating timezone (YYYY-MM-DD). */
export function operatingTodayISO(now: Date = new Date()): string {
  const { y, m, day } = operatingCalendarDate(now);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
