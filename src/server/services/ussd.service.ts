import { MemberAppService } from "@/server/services/member-app.service";
import {
  checkLowBandwidthRateLimit,
  formatKes,
  logLowBandwidthLookup,
  lowBandwidthSafeFallback,
  normalizeChannelPhone,
} from "@/server/services/low-bandwidth-channel.service";

type UssdInput = {
  phoneNumber: string;
  text?: string;
  tenantSlug?: string;
};

function menu() {
  return [
    "CON AiCare member self-service",
    "1. Benefit balance",
    "2. Recent visits",
    "3. Renewal date",
    "4. Find provider",
  ].join("\n");
}

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

export class UssdService {
  static async handle(input: UssdInput) {
    const phone = normalizeChannelPhone(input.phoneNumber);
    if (!checkLowBandwidthRateLimit(`USSD:${phone}`)) return "END Too many requests. Please try again later.";

    const text = (input.text ?? "").trim();
    if (!text) return menu();

    const [selection, ...rest] = text.split("*").map((part) => part.trim());
    const snapshot = await MemberAppService.getLowBandwidthSnapshotByPhone(phone, { tenantSlug: input.tenantSlug });

    if (!snapshot) {
      await logLowBandwidthLookup({ channel: "USSD", action: "UNKNOWN_PHONE", phone });
      return `END ${lowBandwidthSafeFallback()}`;
    }

    if (selection === "1") {
      await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "USSD", action: "BENEFIT_BALANCE", phone });
      const pressure = snapshot.pressureBenefits.length > 0
        ? `\nTop categories: ${snapshot.pressureBenefits.map((benefit) => `${benefit.name} ${formatKes(benefit.remaining)} left`).join("; ")}`
        : "";
      return `END Benefit balance for ${snapshot.memberName}: ${formatKes(snapshot.benefitSummary.totalRemaining)} remaining of ${formatKes(snapshot.benefitSummary.totalLimit)}.${pressure}`;
    }

    if (selection === "2") {
      await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "USSD", action: "RECENT_VISITS", phone });
      if (snapshot.recentEncounters.length === 0) return "END No recent visible visits found.";
      return `END Recent visits:\n${snapshot.recentEncounters.map((visit) => `${formatDate(visit.dateOfService)} ${visit.providerName} ${visit.status}`).join("\n")}`;
    }

    if (selection === "3") {
      await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "USSD", action: "RENEWAL_DATE", phone });
      return `END Your scheme renewal date is ${formatDate(snapshot.renewalDate)}.`;
    }

    if (selection === "4") {
      const area = rest.join(" ").trim();
      if (!area) return "CON Enter area or county name";

      const result = await MemberAppService.getLowBandwidthProvidersByArea({ phone, area, tenantSlug: input.tenantSlug });
      await logLowBandwidthLookup({ tenantId: snapshot.tenantId, memberId: snapshot.memberId, channel: "USSD", action: "PROVIDER_SEARCH", phone, metadata: { area } });
      if (!result || result.providers.length === 0) return `END No active providers found for ${area}. Call Avenue support for help.`;
      return `END Providers near ${area}:\n${result.providers.map((provider) => `${provider.name}${provider.phone ? ` ${provider.phone}` : ""}`).join("\n")}`;
    }

    return menu();
  }
}
