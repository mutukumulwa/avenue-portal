// Sync the database schema to prisma/schema.prisma at deploy time.
//
// Background: the build only ran `prisma generate` + `next build`, so the
// generated client always matched schema.prisma while the *database* did not.
// Schema changes made locally via `prisma db push` never reached production,
// which surfaced at runtime as `PrismaClientKnownRequestError P2022 — column
// does not exist`. This step closes that gap by pushing the schema on deploy.
//
// Safety guards:
//   * Runs ONLY on Vercel *production* deploys (VERCEL_ENV === "production").
//     Preview/development builds and local `npm run build` skip it, so they
//     never mutate the production database. (Locally, use `npm run db:push`.)
//   * Runs only when DIRECT_URL is set (the direct/session connection Prisma
//     uses for schema operations — see prisma.config.ts).
//   * Uses `prisma db push` WITHOUT `--accept-data-loss`, so a destructive
//     change (dropped/renamed column, narrowed type) fails the build loudly
//     instead of silently dropping data. Handle those by hand.
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

console.log("[db-sync] Syncing database schema with `prisma db push`...");
try {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  console.log("[db-sync] Schema is in sync.");
} catch {
  console.error(
    "[db-sync] `prisma db push` failed. If this is a destructive change, " +
      "apply it manually — the build will not drop data automatically.",
  );
  process.exit(1);
}
