/**
 * SP-2 — the canonical server-action error contract (kills defect class C4:
 * silent failure / redirect-on-error / throw-for-validation).
 *
 * Every onboarding-chain server action returns an `ActionResult` instead of
 * throwing for validation or redirecting on error. Forms read the result and
 * render field-level messages adjacent to inputs (`role="alert"`), preserving
 * the user's input. A success may carry data; a failure carries a form-level
 * message and/or per-field errors keyed by field name (matching zod's
 * `flatten().fieldErrors` shape so a schema parse can be forwarded directly).
 *
 * Redirect (when needed) happens only on success, OUTSIDE any try/catch — see
 * the repo landmine that `redirect()` throws.
 */

/** The failure member, usable on its own so `fail()` is assignable to any
 *  `ActionResult<T>` without threading the generic. */
export type ActionFailure = {
  ok: false;
  formError?: string;
  fieldErrors?: Record<string, string[]>;
};

export type ActionResult<T = void> = { ok: true; data?: T } | ActionFailure;

/** Success. Pass a payload only when the action returns one. */
export function ok<T = void>(data?: T): ActionResult<T> {
  return data === undefined ? { ok: true } : { ok: true, data };
}

/**
 * Failure. `fieldErrors` is the per-field map (forward zod's
 * `error.flatten().fieldErrors` here); `formError` is a single form-level
 * message. Empty maps/undefined are omitted so consumers can rely on presence.
 */
export function fail(
  fieldErrors?: Record<string, string[]>,
  formError?: string,
): ActionFailure {
  const hasFields = !!fieldErrors && Object.keys(fieldErrors).length > 0;
  return {
    ok: false,
    ...(hasFields ? { fieldErrors } : {}),
    ...(formError ? { formError } : {}),
  };
}
