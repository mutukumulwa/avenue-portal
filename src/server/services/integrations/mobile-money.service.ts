import { momoService, isMtnMsisdn, type MobileMoneyVerifyResult } from "./momo.service";
import { airtelMoneyService, isAirtelMsisdn } from "./airtel-money.service";

/**
 * Provider-agnostic mobile-money facade (Medvex spec §5.10 / gap G5.10). Uganda
 * rails: MTN MoMo + Airtel Money (replaces Kenya M-Pesa). Callers verify a
 * member payment without hard-coding a provider; detection can also infer the
 * provider from the MSISDN.
 */
export type MobileMoneyProvider = "MTN_MOMO" | "AIRTEL_MONEY";

export class MobileMoneyService {
  /** Infer the provider from a Ugandan MSISDN prefix (null if unknown). */
  static detectProvider(msisdn: string): MobileMoneyProvider | null {
    if (isMtnMsisdn(msisdn)) return "MTN_MOMO";
    if (isAirtelMsisdn(msisdn)) return "AIRTEL_MONEY";
    return null;
  }

  /** Verify a payment against the given (or MSISDN-inferred) provider. */
  static async verify(
    provider: MobileMoneyProvider | "AUTO",
    reference: string,
    expectedAmount: number,
    msisdn: string,
  ): Promise<MobileMoneyVerifyResult> {
    const resolved = provider === "AUTO" ? this.detectProvider(msisdn) : provider;
    if (!resolved) {
      return {
        verified: false,
        provider: "MTN_MOMO",
        source: "stub",
        note: "Could not determine mobile-money provider from the MSISDN",
      };
    }
    return resolved === "MTN_MOMO"
      ? momoService.verifyPayment(reference, expectedAmount, msisdn)
      : airtelMoneyService.verifyPayment(reference, expectedAmount, msisdn);
  }
}
