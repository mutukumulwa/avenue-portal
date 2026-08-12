"use client"; // Error boundaries must be Client Components.

/**
 * UAT-HF P01.04 — boundary for the admin area.
 *
 * Sits below `(admin)/layout.tsx`, so the sidebar and navigation keep rendering
 * when a single admin page fails. Without it, any unhandled render error in an
 * admin route escalates to the application boundary and the operator loses the
 * whole shell — which is how DEF-050 became a module-wide outage rather than one
 * broken page.
 *
 * See docs/vendor/nextjs-15.5.15/01-app/03-api-reference/03-file-conventions/error.mdx
 */
import { ErrorRecovery } from "@/components/errors/ErrorRecovery";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorRecovery error={error} reset={reset} homeHref="/dashboard" homeLabel="Back to dashboard" />;
}
