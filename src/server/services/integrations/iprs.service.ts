// ─── IPRS STUB ───────────────────────────────────────────────────────────────
// Kenya Population Register Service integration.
// Status: STUB — real integration deferred until platform buyer IPRS
// provisioning is understood (provisioning path differs by buyer type).
//
// When integrating:
//   Set IPRS_API_URL and IPRS_API_KEY in your .env
//   Replace the stub body with an HTTP call to the IPRS REST API.
//   The operator note will disappear once `source` is "iprs_api".

export interface IprsResult {
  valid: boolean;
  name: string | null;
  dob: Date | null;
  source: "stub" | "iprs_api";
  note?: string;
}

export const iprsService = {
  async validate(_nationalId: string): Promise<IprsResult> {
    return {
      valid: true,
      name: null,
      dob: null,
      source: "stub",
      note: "IPRS validation not yet integrated — manual ID verification required",
    };
  },
};
