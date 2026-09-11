/**
 * Family Hospital UAT plan §9 — structured, secret-free events for provider
 * capture and account setup.
 *
 * The rule is enforced by construction rather than by care: only the keys in
 * `ALLOWED_FIELDS` are ever written, and every value must already be a string,
 * number, boolean or null. A member number, a name, an email address, a
 * diagnosis description, an invitation token or raw SMTP text therefore cannot
 * be logged through this helper even by mistake — there is no key for it.
 *
 * Normal type-ahead searches are NOT logged (plan §9.5); only failures,
 * ambiguities, throttles and state changes.
 */
type FieldValue = string | number | boolean | null;

const ALLOWED_FIELDS = new Set([
  "correlationId",
  "tenantId",
  "providerId",
  "actorId",
  "purpose",
  "outcome",
  "reasonCode",
  "code",
  "durationMs",
  "category",
  "count",
  "tariffId",
  "engineTariffId",
  "contractId",
  "invitationId",
  "deliveryStatus",
  "failureClass",
  "attempt",
]);

export type CaptureEventName =
  | "member_resolution"
  | "contract_resolution_failed"
  | "catalogue_search_failed"
  | "catalogue_ambiguity"
  | "catalogue_throttled"
  | "stale_tariff_rejected"
  | "invitation_delivery"
  | "invitation_activation"
  | "navigation_render_error";

export function captureEvent(event: CaptureEventName, fields: Record<string, FieldValue | undefined>): void {
  const safe: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key) || value === undefined) continue;
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) continue;
    safe[key] = value;
  }
  console.info(JSON.stringify({ event, at: new Date().toISOString(), ...safe }));
}
