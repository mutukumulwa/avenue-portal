// Bring the production database schema up to date at deploy time.
//
// Background: the build originally ran only `prisma generate` + `next build`, so
// the generated client always matched schema.prisma while the *database* did not.
// Schema changes made locally via `prisma db push` never reached production,
// surfacing at runtime as `PrismaClientKnownRequestError P2022 — column does not
// exist`. This step closes that gap.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO MODES (UAT-HF P00.04 / DEC-13)
//
// `push` (default, unchanged legacy behaviour)
//     Runs `prisma db push`. Schema-only: it cannot express CHECK constraints, so
//     the three onboarding invariants had to be applied by hand out-of-band, and
//     prisma/migrations/ drifted ~3 months behind reality. This is the behaviour
//     that made schema deployment unreproducible in the first place.
//
// `migrate` (target state)
//     Runs `prisma migrate deploy` against the reviewed, versioned migrations in
//     prisma/migrations/, which now include the invariant CHECK constraints and
//     the TreatmentExclusionRule owner-cascade fix.
//
// Selected with SCHEMA_DEPLOY_MODE. It defaults to `push` deliberately: switching
// production to `migrate` requires a ONE-TIME manual step first, and a deploy that
// skipped it would fail. See docs/uat-human-factors-remediation/SCHEMA_DEPLOYMENT.md
// for the cutover runbook. Do not flip the default without completing it.
// ─────────────────────────────────────────────────────────────────────────────
//
// Safety guards (both modes):
//   * Runs ONLY on Vercel *production* deploys (VERCEL_ENV === "production").
//     Preview/development builds and local `npm run build` skip it, so they never
//     mutate the production database. (Locally, use `npm run db:push`.)
//   * Runs only when DIRECT_URL is set (the direct/session connection Prisma uses
//     for schema operations — see prisma.config.ts). The prod pooler on 6543
//     cannot execute DDL; this must be the direct 5432 connection.
//   * `db push` runs WITHOUT --accept-data-loss, so a destructive change fails the
//     build loudly instead of silently dropping data.
import { execSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv !== "production") {
  console.log(
    `[db-sync] Skipping schema sync (VERCEL_ENV=${vercelEnv ?? "unset"}; runs only on production deploys).`,
  );
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  console.log("[db-sync] Skipping schema sync (DIRECT_URL not set).");
  process.exit(0);
}

// Report what was actually READ, not just what it resolved to. Three production
// deploys in a row logged `mode=push` while the operator believed the variable
// was set to `migrate`, and the log could not distinguish "unset" from "set to
// push" — so the diagnosis was guesswork about a dashboard nobody could see
// from here. It turned out to be set on a SIBLING PROJECT in the same team.
// `<undefined>` means the variable never reached this build; a quoted value
// says exactly what did arrive, whitespace included.
const rawMode = process.env.SCHEMA_DEPLOY_MODE;
console.log(
  `[db-sync] SCHEMA_DEPLOY_MODE=${rawMode === undefined ? "<undefined>" : JSON.stringify(rawMode)}`,
);

// ── No silent default on production ─────────────────────────────────────────
//
// This used to fall back to `push` when the variable was absent. That fallback
// is how five consecutive production deploys ran `db push` while everyone
// believed the migrate cutover was live: each one applied schema changes
// without recording a migration row, and each row then had to be written by
// hand before `migrate deploy` could ever run.
//
// A default that is silently wrong is the same defect class this branch exists
// to remove. So production must SAY which mode it wants. `push` remains
// perfectly valid — it just has to be chosen rather than inherited.
//
// This is deliberately fatal rather than a warning: a warning in a build log is
// a thing nobody reads until the incident review.
if (rawMode === undefined) {
  console.error(
    "[db-sync] SCHEMA_DEPLOY_MODE is not set on this production deployment.\n" +
      "\n" +
      "  Refusing to guess. This used to default to `push`, which silently applied\n" +
      "  schema changes without recording a migration row — five deploys ran that\n" +
      "  way before anyone noticed, and every one needed a manual repair after.\n" +
      "\n" +
      "  Set it in Vercel → the avenue-portal project → Settings → Environment\n" +
      "  Variables, ticked for the PRODUCTION environment:\n" +
      "\n" +
      "    SCHEMA_DEPLOY_MODE=migrate   apply prisma/migrations via `migrate deploy`\n" +
      "    SCHEMA_DEPLOY_MODE=push      previous behaviour, no migration history\n" +
      "\n" +
      "  Check the PROJECT as well as the value: this was once set on a sibling\n" +
      "  project in the same team, which reads as configured and reaches nothing.",
  );
  process.exit(1);
}

// `.trim()` because a trailing space in a dashboard field is invisible and would
// otherwise fail the build on an unrecognised value rather than doing the
// obvious thing.
const mode = rawMode.trim().toLowerCase();

if (mode !== "push" && mode !== "migrate") {
  console.error(
    `[db-sync] SCHEMA_DEPLOY_MODE="${mode}" is not recognised. Use "migrate" or "push" (default).`,
  );
  process.exit(1);
}

const command = mode === "migrate" ? "npx prisma migrate deploy" : "npx prisma db push";

console.log(`[db-sync] mode=${mode} — running \`${command}\`...`);
try {
  execSync(command, { stdio: "inherit" });
  console.log("[db-sync] Schema is in sync.");
} catch {
  if (mode === "migrate") {
    console.error(
      "[db-sync] `prisma migrate deploy` failed.\n" +
        "  If this is the FIRST deploy after the migrate cutover, the most likely cause is that\n" +
        "  the baseline migration was never marked as already-applied, so Prisma is trying to\n" +
        "  CREATE tables that already exist. Run the one-time cutover in\n" +
        "  docs/uat-human-factors-remediation/SCHEMA_DEPLOYMENT.md, or set\n" +
        "  SCHEMA_DEPLOY_MODE=push to roll back to the previous behaviour.",
    );
  } else {
    console.error(
      "[db-sync] `prisma db push` failed. If this is a destructive change, " +
        "apply it manually — the build will not drop data automatically.",
    );
  }
  process.exit(1);
}
