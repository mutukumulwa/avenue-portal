// ─── MTN MOBILE MONEY (MoMo) STUB ────────────────────────────────────────────
// Uganda mobile-money rail (Medvex spec §5.10 / gap G5.10 / OD-7). Replaces
// M-Pesa/Daraja (Kenya). Same shape as the other rails so callers are provider-
// agnostic via MobileMoneyService.
//
// Status: STUB — pending MoMo Collections API provisioning. When integrating:
//   Set MOMO_SUBSCRIPTION_KEY, MOMO_API_USER, MOMO_API_KEY, MOMO_TARGET_ENV in
//   .env and query the RequestToPay status endpoint by referenceId.
//
// Fraud reframing (OD-7): the risk is a FAKE confirmation SMS (not a reversal).
// Never trust the SMS — always verify against the MoMo API. The stub returns
// unverified so nothing auto-confirms until the real integration lands.

export interface MobileMoneyVerifyResult {
  verified: boolean;
  provider: "MTN_MOMO" | "AIRTEL_MONEY";
  source: "stub" | "provider_api";
  note: string;
  details?: { amount: number; msisdn: string; transactionDate: string };
}

/** Ugandan MTN MSISDN: +2567[7|8]XXXXXXX (loose check). */
export function isMtnMsisdn(msisdn: string): boolean {
  return /^(?:\+?256|0)7[78]\d{7}$/.test((msisdn || "").replace(/\s/g, ""));
}

export const momoService = {
  async verifyPayment(referenceId: string, _expectedAmount: number, _msisdn: string): Promise<MobileMoneyVerifyResult> {
    return {
      verified: false,
      provider: "MTN_MOMO",
      source: "stub",
      note: referenceId
        ? "MTN MoMo verification not yet integrated — verify via the MoMo portal / RequestToPay status"
        : "Missing MoMo reference id",
    };
  },
};
