// ─── AIRTEL MONEY STUB ───────────────────────────────────────────────────────
// Uganda mobile-money rail (Medvex spec §5.10 / gap G5.10 / OD-7). Same shape as
// MTN MoMo so callers stay provider-agnostic via MobileMoneyService.
//
// Status: STUB — pending Airtel Money API provisioning. When integrating:
//   Set AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET, AIRTEL_COUNTRY=UG in .env and
//   query the transaction-status endpoint by transactionId.
//
// Fraud reframing (OD-7): verify against the Airtel API — never trust the SMS.

import type { MobileMoneyVerifyResult } from "./momo.service";

/** Ugandan Airtel MSISDN: +2567[0|1|5]XXXXXXX (loose check). */
export function isAirtelMsisdn(msisdn: string): boolean {
  return /^(?:\+?256|0)7[015]\d{7}$/.test((msisdn || "").replace(/\s/g, ""));
}

export const airtelMoneyService = {
  async verifyPayment(transactionId: string, _expectedAmount: number, _msisdn: string): Promise<MobileMoneyVerifyResult> {
    return {
      verified: false,
      provider: "AIRTEL_MONEY",
      source: "stub",
      note: transactionId
        ? "Airtel Money verification not yet integrated — verify via the Airtel merchant portal"
        : "Missing Airtel transaction id",
    };
  },
};
