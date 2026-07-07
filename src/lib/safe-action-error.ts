import { TRPCError } from "@trpc/server";

/**
 * PR-V02b — never leak low-level/DB errors to the user or the URL.
 *
 * Server actions catch exceptions and surface them via `?error=`. Passing the
 * raw `err.message` exposed internals (e.g. a Prisma transaction-timeout stack)
 * in the settlement UAT. `safeActionError` maps a caught error to a message
 * that is safe to display:
 *
 *  - Next.js control-flow signals (redirect / notFound) are re-thrown so the
 *    caller never swallows them.
 *  - Our own controlled errors (`TRPCError`, and validation `Error`s thrown by
 *    the services) carry user-facing text and are surfaced as-is.
 *  - Anything that looks low-level (Prisma, connection, SQL) is logged
 *    server-side and replaced with a generic message.
 */
export function safeActionError(err: unknown, context?: string): string {
  // Next.js uses thrown "errors" for redirect()/notFound() — must propagate.
  if (isNextControlFlow(err)) throw err;

  if (err instanceof TRPCError) return err.message;

  if (err instanceof Error && !looksLowLevel(err) && err.message) {
    return err.message;
  }

  console.error(`[action-error]${context ? ` ${context}` : ""}`, err);
  return "Something went wrong. Please try again, or contact support if it keeps happening.";
}

function isNextControlFlow(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")) {
    return true;
  }
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && (message.startsWith("NEXT_REDIRECT") || message === "NEXT_NOT_FOUND");
}

function looksLowLevel(err: Error): boolean {
  const name = err.name || err.constructor?.name || "";
  if (name.startsWith("Prisma")) return true;
  return /prisma[.$]|Invalid `|Transaction API|PrismaClient|ECONNREFUSED|ETIMEDOUT|getaddrinfo|ENOTFOUND|does not exist on the current database|column .* does not exist|relation .* does not exist|deadlock|connection pool|interactive transaction/i.test(
    err.message || "",
  );
}
