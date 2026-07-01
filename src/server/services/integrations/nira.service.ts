// ─── NIRA STUB ───────────────────────────────────────────────────────────────
// Uganda National Identification & Registration Authority (NIRA) integration
// (Medvex spec §5.9 / gap G5.9). Replaces the Kenya IPRS adapter — same shape so
// call-sites are identity-provider agnostic.
//
// Status: STUB — real integration pending NIRA API provisioning/commercial terms
// (OD-6). When integrating:
//   Set NIRA_API_URL and NIRA_API_KEY in your .env
//   Replace the stub body with an HTTP call to the NIRA verification API
//   (validate a National Identification Number [NIN] + optional card details;
//    cross-reference name/DOB; return a photo ref for liveness/face-match).
//   `source` becomes "nira_api" once live, and the operator note disappears.

export interface IdentityResult {
  valid: boolean;
  name: string | null;
  dob: Date | null;
  source: "stub" | "nira_api";
  note?: string;
}

/** Ugandan NIN: 14 alphanumeric characters (e.g. CM + 12). Loose format check. */
export function isPlausibleNin(nin: string): boolean {
  return /^[A-Z0-9]{9,14}$/i.test((nin || "").trim());
}

export const niraService = {
  async validate(nin: string): Promise<IdentityResult> {
    if (!isPlausibleNin(nin)) {
      return {
        valid: false,
        name: null,
        dob: null,
        source: "stub",
        note: "NIN format not plausible — check the National ID number.",
      };
    }
    return {
      valid: true,
      name: null,
      dob: null,
      source: "stub",
      note: "NIRA validation not yet integrated — manual ID verification required",
    };
  },
};
