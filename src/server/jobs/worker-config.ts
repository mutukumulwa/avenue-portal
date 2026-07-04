/**
 * Worker boot-time configuration validation (PR-002).
 *
 * The June UAT's silent-failure storm came from the worker starting without
 * env and falling back to defaults (the OS-username Postgres DB). The rule:
 * missing or placeholder DATABASE_URL / REDIS_URL ⇒ exit non-zero immediately
 * with a one-line actionable error — NEVER fall back.
 *
 * Pure function so it is unit-testable (acceptance test 4).
 */

export interface WorkerConfigResult {
  ok: boolean;
  errors: string[];
}

const PLACEHOLDER_HINTS = ["CHANGE_ME", "changeme", "<", "example.com", "user:password@"];

export function validateWorkerConfig(env: Record<string, string | undefined>): WorkerConfigResult {
  const errors: string[] = [];

  const dbUrl = env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === "") {
    errors.push("DATABASE_URL is not set — the worker refuses to guess a database. Set it in .env or the process environment.");
  } else if (!/^postgres(ql)?:\/\//.test(dbUrl)) {
    errors.push(`DATABASE_URL does not look like a Postgres URL (${dbUrl.slice(0, 24)}…).`);
  } else if (PLACEHOLDER_HINTS.some((h) => dbUrl.includes(h))) {
    errors.push("DATABASE_URL still contains a placeholder value — replace it with the real connection string.");
  }

  const redisUrl = env.REDIS_URL;
  if (!redisUrl || redisUrl.trim() === "") {
    errors.push("REDIS_URL is not set — the worker refuses to fall back to localhost. Set it in .env or the process environment.");
  } else if (!/^rediss?:\/\//.test(redisUrl)) {
    errors.push(`REDIS_URL does not look like a Redis URL (${redisUrl.slice(0, 24)}…).`);
  }

  return { ok: errors.length === 0, errors };
}
