/**
 * UAT-HF P12.03 — deploy by dependency, behind separate flags.
 *
 * The plan is explicit on two points, and both are load-bearing:
 *
 *   "Use separate flags for entitlement enforcement, new imports, lifecycle
 *    commands, offline sync types, package approvals, and privacy reveal.
 *    **Do not use one global flag.**"
 *
 *   "Rollback disables new entry paths while existing receipts/jobs/events
 *    remain readable and finish safely."
 *
 * ## The second point is the whole design
 *
 * A flag here gates **starting** something, never **finishing** it. Turning a
 * flag off must not strand an import that is mid-run, an outbox row that is
 * mid-projection, or a receipt somebody is waiting on. That is why the API is
 * `canStart(flag)` and there is deliberately no `isProcessingEnabled` — a
 * worker that stopped draining because a flag flipped would convert a rollback
 * into the exact defect class this engagement spent its time removing (DEF-068:
 * "an interrupted bulk import commits every row but is presented as a crash").
 *
 * So: entry paths consult a flag. Completion paths never do.
 *
 * ## Why environment variables rather than a database table
 *
 * A rollback has to be possible when the product is misbehaving, which is
 * exactly when a database round-trip is least trustworthy. Vercel environment
 * variables change without a code deploy and are readable synchronously here.
 * Per-TENANT and per-PROVIDER rollout already has a home in
 * `ProviderAccessSettingsService` (global flag ∪ allow-list) — these are the
 * coarser release-level switches that sit above it, not a replacement.
 *
 * ## Defaults are the safe direction, which is not always "off"
 *
 * Each flag documents which way is safe and why. `PRIVACY_REVEAL` defaults ON
 * because it gates an operator's ability to *see* data they are entitled to,
 * and defaulting that off reproduces the live blocker where nobody can reveal a
 * masked national ID. `ENTITLEMENT_ENFORCEMENT` defaults OFF because enabling it
 * before the readiness report reads zero would deny legitimate claims.
 */

export const FEATURE_FLAGS = {
  /**
   * Fail-closed provider entitlement on claims and eligibility.
   *
   * OFF by default. `scripts/reports/provider-entitlement-readiness.ts` must
   * read zero first — turning this on against incomplete entitlement data
   * denies claims for providers that are legitimately contracted.
   */
  ENTITLEMENT_ENFORCEMENT: {
    env: "FLAG_ENTITLEMENT_ENFORCEMENT",
    default: false,
    safeDirection: "off",
    gates: "New claim/eligibility decisions consult provider entitlement fail-closed.",
  },

  /**
   * The durable import ledger path (P06) for NEW uploads.
   *
   * ON by default: the ledger is how an interrupted import becomes
   * reconstructible rather than a crash. Turning it off stops new uploads
   * entering the new path; batches already queued keep draining.
   */
  IMPORT_DURABLE_LEDGER: {
    env: "FLAG_IMPORT_DURABLE_LEDGER",
    default: true,
    safeDirection: "on",
    gates: "New bulk-import uploads use the durable job/row ledger.",
  },

  /**
   * Governed member lifecycle commands (suspend / lapse / reinstate / leaver).
   *
   * ON by default. Off means the product offers no lifecycle action rather than
   * offering an ungoverned one — DEF-059's defect was a single-click change
   * with no confirmation, and reverting to that is not a rollback.
   */
  LIFECYCLE_COMMANDS: {
    env: "FLAG_LIFECYCLE_COMMANDS",
    default: true,
    safeDirection: "on",
    gates: "Governed lifecycle transitions are offered and accepted.",
  },

  /**
   * Accepting new offline-capture sync payload types.
   *
   * ON by default. Off refuses NEW sync submissions of the newer types; packs
   * already issued and rows already queued still reconcile, because a facility
   * that captured a day offline must be able to hand it in.
   */
  OFFLINE_SYNC_TYPES: {
    env: "FLAG_OFFLINE_SYNC_TYPES",
    default: true,
    safeDirection: "on",
    gates: "New offline sync submissions of the extended payload types.",
  },

  /**
   * Package-version change control (draft → approve → activate).
   *
   * ON by default. Off would restore the DEF-024 behaviour where one
   * underwriter changes live cover unreviewed, so this exists to be *audited*,
   * not realistically to be turned off.
   */
  PACKAGE_APPROVALS: {
    env: "FLAG_PACKAGE_APPROVALS",
    default: true,
    safeDirection: "on",
    gates: "Coverage edits land on a draft and require a different checker.",
  },

  /**
   * Revealing masked member identifiers to a permitted operator.
   *
   * ON by default — and note which way "safe" runs here. This gates a
   * *permitted* operator seeing data they are entitled to; defaulting it off
   * reproduces the live blocker where nobody can reveal a masked national ID.
   * The permission check (`member.sensitive.reveal`) is the real control and is
   * always enforced regardless of this flag.
   */
  PRIVACY_REVEAL: {
    env: "FLAG_PRIVACY_REVEAL",
    default: true,
    safeDirection: "on",
    gates: "The reveal control is offered to operators who hold the permission.",
  },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

function readEnv(name: string): string | undefined {
  // `process.env` is inlined at build time for client bundles; these flags are
  // read on the server, where the live value is what matters for rollback.
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

/** Parse an env value into a boolean, or undefined when unset/unrecognised. */
export function parseFlagValue(raw: string | undefined): boolean | undefined {
  if (raw == null) return undefined;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "on", "yes", "enabled"].includes(v)) return true;
  if (["0", "false", "off", "no", "disabled"].includes(v)) return false;
  // An unrecognised value is NOT treated as "off". A typo in a Vercel variable
  // must not silently disable a control; the documented default stands.
  return undefined;
}

/**
 * May a NEW instance of this capability be started?
 *
 * The only question a flag answers. There is deliberately no companion that
 * asks whether in-flight work may finish — see the module header.
 */
export function canStart(flag: FeatureFlag): boolean {
  const spec = FEATURE_FLAGS[flag];
  return parseFlagValue(readEnv(spec.env)) ?? spec.default;
}

/** Every flag's effective state, for the support/observability surface. */
export function flagSnapshot(): Array<{
  flag: FeatureFlag;
  env: string;
  effective: boolean;
  default: boolean;
  overridden: boolean;
  gates: string;
}> {
  return (Object.keys(FEATURE_FLAGS) as FeatureFlag[]).map((flag) => {
    const spec = FEATURE_FLAGS[flag];
    const override = parseFlagValue(readEnv(spec.env));
    return {
      flag,
      env: spec.env,
      effective: override ?? spec.default,
      default: spec.default,
      overridden: override !== undefined,
      gates: spec.gates,
    };
  });
}

/**
 * The deployment order P12.03 specifies, as data.
 *
 * Kept here rather than only in prose so a release checklist can be generated
 * from the same source the code reads, and so the dependency between stages is
 * reviewable in a diff.
 */
export const DEPLOY_ORDER: ReadonlyArray<{ stage: string; note: string }> = [
  { stage: "foundations / error containment", note: "P01 — envelope, receipts, outbox, boundaries. No flag; it is the substrate." },
  { stage: "data backfills", note: "P12.02 — dry-run, sign, then bounded idempotent batches." },
  { stage: "contract guard", note: "P02 — date validation and non-crashing reads." },
  { stage: "entitlement shadow mode", note: "ENTITLEMENT_ENFORCEMENT stays OFF; readiness report must read zero first." },
  { stage: "member / import / lifecycle", note: "IMPORT_DURABLE_LEDGER, LIFECYCLE_COMMANDS." },
  { stage: "package policy", note: "PACKAGE_APPROVALS." },
  { stage: "auth / UX", note: "P10, P11. No flag; these are corrections, not new paths." },
  { stage: "fail-closed flags", note: "ENTITLEMENT_ENFORCEMENT last, once its report is clean." },
];
