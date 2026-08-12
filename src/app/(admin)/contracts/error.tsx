"use client"; // Error boundaries must be Client Components.

/**
 * UAT-HF P01.04 — segment boundary for provider contracts. This is the DEF-050
 * containment.
 *
 * The run's only S1 that took a whole module down: one ordinary "Create draft"
 * saved a contract whose dates could not be rendered, and `RangeError: Invalid
 * time value` then threw in BOTH the list and the detail renderer (digests
 * 3293912966 / 2860195592). Every user lost the entire Provider Contracts module,
 * and no UI recovery path existed — the offending row was reachable only through
 * the two crashing routes, so it had to be deleted out-of-band in production.
 *
 * A boundary here keeps the admin shell and navigation alive, so the operator can
 * leave and use the rest of the product while the data is repaired.
 *
 * This contains the blast radius; it does not fix the cause. P02.01 stops the bad
 * date being written, P02.02 makes one bad row render as "Invalid date — repair
 * required" instead of throwing, and P02.03 adds the governed repair path.
 */
import { ErrorRecovery } from "@/components/errors/ErrorRecovery";

export default function ContractsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorRecovery
      error={error}
      reset={reset}
      area="provider contracts"
      homeHref="/dashboard"
      homeLabel="Back to dashboard"
    />
  );
}
