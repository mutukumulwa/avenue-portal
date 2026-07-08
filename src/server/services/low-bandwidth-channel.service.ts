import { prisma } from "@/lib/prisma";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const hits = new Map<string, number[]>();

export function normalizeChannelPhone(phone: string) {
  const compact = phone.replace(/[^\d+]/g, "");
  if (compact.startsWith("+254")) return compact;
  if (compact.startsWith("254")) return `+${compact}`;
  if (compact.startsWith("0")) return `+254${compact.slice(1)}`;
  return compact;
}

export function lowBandwidthSafeFallback() {
  return "We could not verify your member profile. Please contact Medvex support or use the member portal.";
}

export function formatKes(value: number) {
  if (value >= 1_000_000) return `UGX ${(value / 1_000_000).toFixed(1)}M`;
  return `UGX ${Math.round(value).toLocaleString("en-UG")}`;
}

export function checkLowBandwidthRateLimit(key: string) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  return recent.length <= MAX_REQUESTS;
}

export async function logLowBandwidthLookup(input: {
  tenantId?: string;
  memberId?: string;
  channel: "USSD" | "SMS";
  action: string;
  phone: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await prisma.activityLog.create({
    data: {
      entityType: "MEMBER_LOW_BANDWIDTH",
      entityId: input.memberId ?? normalizeChannelPhone(input.phone),
      action: input.action,
      description: `${input.channel} member lookup: ${input.action}`,
      memberId: input.memberId,
      metadata: {
        channel: input.channel,
        phoneHash: normalizeChannelPhone(input.phone).slice(-4),
        ...(input.tenantId ? { tenantId: input.tenantId } : {}),
        ...(input.metadata ?? {}),
      },
    },
  });
}
