// ─── M-PESA DARAJA API STUB ───────────────────────────────────────────────────
// Status: STUB — real integration deferred (Decision #7, confirmed 2026-05-12).
//
// When integrating:
//   Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE,
//   MPESA_PASSKEY in your .env, then replace the stub body with a Daraja
//   API call to the TransactionStatus endpoint.
//
// The primary risk flagged in the spec is fake M-Pesa confirmation SMS.
// Real integration validates against Daraja — stub always returns unverified.

export interface MpesaVerifyResult {
  verified: boolean;
  source: "stub" | "daraja_api";
  note: string;
  transactionDetails?: {
    amount: number;
    phoneNumber: string;
    transactionDate: string;
  };
}

export const mpesaService = {
  async verifyConfirmation(
    _confirmationCode: string,
    _expectedAmount: number,
    _memberId: string,
  ): Promise<MpesaVerifyResult> {
    return {
      verified: false,
      source: "stub",
      note: "M-Pesa Daraja verification not yet integrated — verify manually via M-Pesa portal or Safaricom business statement",
    };
  },
};
