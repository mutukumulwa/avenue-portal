"use client"; // Error boundaries must be Client Components.

/**
 * UAT-HF P01.04 — the application-wide error boundary.
 *
 * Catches render and data-loading errors anywhere under the root layout that a
 * nearer boundary did not handle. The root layout still renders, so the user keeps
 * the app shell and a way out.
 *
 * Form submissions do NOT land here: P01.01's `useMutationAction` keeps a failed
 * mutation local so the form and everything typed into it survive (DEF-065).
 *
 * See docs/vendor/nextjs-15.5.15/01-app/03-api-reference/03-file-conventions/error.mdx
 */
import { ErrorRecovery } from "@/components/errors/ErrorRecovery";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorRecovery error={error} reset={reset} />;
}
