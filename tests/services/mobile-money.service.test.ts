import { describe, it, expect } from "vitest";
import { MobileMoneyService } from "@/server/services/integrations/mobile-money.service";
import { isMtnMsisdn } from "@/server/services/integrations/momo.service";
import { isAirtelMsisdn } from "@/server/services/integrations/airtel-money.service";

describe("Mobile money — MoMo + Airtel (G5.10)", () => {
  it("detects MTN MoMo from an MTN MSISDN", () => {
    expect(MobileMoneyService.detectProvider("+256770123456")).toBe("MTN_MOMO");
    expect(isMtnMsisdn("0781234567")).toBe(true);
  });

  it("detects Airtel Money from an Airtel MSISDN", () => {
    expect(MobileMoneyService.detectProvider("+256700123456")).toBe("AIRTEL_MONEY");
    expect(isAirtelMsisdn("0751234567")).toBe(true);
  });

  it("returns null for an unrecognised MSISDN", () => {
    expect(MobileMoneyService.detectProvider("+254712345678")).toBeNull();
  });

  it("AUTO routes to the inferred provider (stub → unverified, never trust the SMS)", async () => {
    const r = await MobileMoneyService.verify("AUTO", "REF123", 5000, "+256770123456");
    expect(r.provider).toBe("MTN_MOMO");
    expect(r.verified).toBe(false); // fraud reframing: nothing auto-confirms on the stub
    expect(r.source).toBe("stub");
  });

  it("explicit Airtel verification uses the Airtel adapter", async () => {
    const r = await MobileMoneyService.verify("AIRTEL_MONEY", "TXN9", 5000, "+256750123456");
    expect(r.provider).toBe("AIRTEL_MONEY");
  });

  it("reports when the provider can't be determined", async () => {
    const r = await MobileMoneyService.verify("AUTO", "REF", 100, "not-a-number");
    expect(r.verified).toBe(false);
    expect(r.note).toMatch(/could not determine/i);
  });
});
