import { MemberAppService } from "@/server/services/member-app.service";
import {
  checkLowBandwidthRateLimit,
  formatKes,
  logLowBandwidthLookup,
  lowBandwidthSafeFallback,
  normalizeChannelPhone,
} from "@/server/services/low-bandwidth-channel.service";

type SmsInput = {
  phoneNumber: string;
  message: string;
  tenantSlug?: string;
};

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

export class SmsQueryService {
  static async handle(input: SmsInput) {
    const phone = normalizeChannelPhone(input.phoneNumber);
    if (!checkLowBandwidthRateLimit(`SMS:${phone}`)) return "Too many requests. Please try again later.";

    const message = input.message.trim();
    const [keywordRaw, ...rest] = message.split(/\s+/);
    const keyword = keywordRaw?.toUpperCase() ?? "";

    const snapshot = await MemberAppService.getLowBandwidthSnapshotByPhone(phone, { tenantSlug: input.tenantSlug });
    if (!snapshot) {
      await logLowBandwidthLookup({ channel: "SMS", action: "UNKNOWN_PHONE", phone });
      return lowBandwidthSafeFallback();
    }

    if (keyword === "BAL" || keyword === "BALANCE") {
      await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "SMS", action: "BENEFIT_BALANCE", phone });
      return `AiCare: ${formatKes(snapshot.benefitSummary.totalRemaining)} benefit remaining of ${formatKes(snapshot.benefitSummary.totalLimit)}. Renewal ${formatDate(snapshot.renewalDate)}.`;
    }

    if (keyword === "VISITS" || keyword === "VISIT") {
      await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "SMS", action: "RECENT_VISITS", phone });
      if (snapshot.recentEncounters.length === 0) return "AiCare: No recent visible visits found.";
      return `AiCare visits: ${snapshot.recentEncounters.map((visit) => `${formatDate(visit.dateOfService)} ${visit.providerName}`).join("; ")}`;
    }

    if (keyword === "RENEWAL") {
      await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "SMS", action: "RENEWAL_DATE", phone });
      return `AiCare: Your scheme renewal date is ${formatDate(snapshot.renewalDate)}.`;
    }

    if (keyword === "LOC" || keyword === "PROVIDER") {
      const area = rest.join(" ").trim();
      if (!area) return "AiCare: Reply LOC followed by area, e.g. LOC Westlands.";

      const result = await MemberAppService.getLowBandwidthProvidersByArea({ phone, area, tenantSlug: input.tenantSlug });
      await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "SMS", action: "PROVIDER_SEARCH", phone, metadata: { area } });
      if (!result || result.providers.length === 0) return `AiCare: No active providers found for ${area}. Call Medvex support for help.`;
      return `AiCare providers near ${area}: ${result.providers.map((provider) => `${provider.name}${provider.phone ? ` ${provider.phone}` : ""}`).join("; ")}`;
    }

    await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "SMS", action: "HELP", phone });
    return "AiCare: Use BAL for balance, VISITS for recent visits, RENEWAL for renewal date, or LOC area for providers.";
  }
}
