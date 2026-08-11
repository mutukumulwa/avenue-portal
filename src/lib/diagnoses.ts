/**
 * ELIG-GAP-023 — diagnosis JSON has TWO persisted shapes:
 *   - Claim.diagnoses            → { icdCode, description, isPrimary }  (claim-intake/persist.ts)
 *   - PreAuthorization.diagnoses → { code,    description, isPrimary }  (preauth-intake)
 *
 * A reader that expects only one key renders a blank code for the other shape.
 * Read the ICD code through this normaliser so BOTH shapes display correctly.
 */
export interface DiagnosisShape {
  code?: string | null;
  icdCode?: string | null;
  description?: string | null;
  isPrimary?: boolean;
}

/** The ICD code regardless of which shape persisted it (icdCode first, then code). */
export function diagnosisCodeOf(d: DiagnosisShape): string | undefined {
  return d.icdCode ?? d.code ?? undefined;
}
