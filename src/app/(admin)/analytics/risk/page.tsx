import Link from "next/link";
import { RiskTier } from "@prisma/client";
import {
  Activity,
  ArrowLeft,
  Filter,
  HeartPulse,
  ShieldAlert,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { requireRole, ROLES, type UserRole } from "@/lib/rbac";
import { getAnalyticsAccessScope } from "@/lib/analytics-access";
import { AnalyticsService } from "@/server/services/analytics.service";
import { bulkEnrolCareManagementAction } from "./actions";

type SearchParams = {
  tier?: string;
  groupId?: string;
  chronicTag?: string;
  minUtilization?: string;
  projectedWithin?: string;
};

type RiskData = Awaited<ReturnType<typeof AnalyticsService.getMemberRiskProfiles>>;
type RiskProfile = RiskData["profiles"][number];

const NAMED_RISK_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "CLAIMS_OFFICER",
  "MEDICAL_OFFICER",
  "UNDERWRITER",
  "CUSTOMER_SERVICE",
];

function enumValue<T extends Record<string, string>>(source: T, value?: string) {
  return value && Object.values(source).includes(value) ? value as T[keyof T] : undefined;
}

function numberParam(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatMoney(value: number) {
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `KES ${(value / 1_000).toFixed(0)}K`;
  return `KES ${value.toLocaleString()}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "No projection";
  return value.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function riskTone(tier: RiskTier) {
  if (tier === "CRITICAL") return "bg-[#DC3545]/10 text-[#DC3545]";
  if (tier === "HIGH") return "bg-[#FFC107]/15 text-[#856404]";
  if (tier === "MODERATE") return "bg-[#17A2B8]/10 text-[#17A2B8]";
  return "bg-[#28A745]/10 text-[#28A745]";
}

function utilizationTone(value: number) {
  if (value >= 1) return "bg-[#DC3545]";
  if (value >= 0.8) return "bg-[#FFC107]";
  if (value >= 0.55) return "bg-[#17A2B8]";
  return "bg-[#28A745]";
}

function filterHref(params: SearchParams, updates: SearchParams) {
  const next = new URLSearchParams();
  const merged = { ...params, ...updates };
  for (const [key, value] of Object.entries(merged)) {
    if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/analytics/risk?${query}` : "/analytics/risk";
}

function MetricCards({ data }: { data: RiskData }) {
  const cards = [
    {
      label: "Risk Profiles",
      value: data.summary.total.toLocaleString(),
      detail: "Members in current scope",
      icon: UserRound,
      tone: "bg-avenue-indigo/10 text-avenue-indigo",
    },
    {
      label: "High / Critical",
      value: data.summary.highAndCritical.toLocaleString(),
      detail: "Needs closer review",
      icon: ShieldAlert,
      tone: "bg-[#DC3545]/10 text-[#DC3545]",
    },
    {
      label: "Projected 90d",
      value: data.summary.projectedWithin90Days.toLocaleString(),
      detail: "Could exceed cap soon",
      icon: TrendingUp,
      tone: "bg-[#FFC107]/15 text-[#856404]",
    },
    {
      label: "Trailing Cost",
      value: formatMoney(data.summary.trailing12ClaimCost),
      detail: `${formatPercent(data.summary.averageUtilizationToCap)} avg cap use`,
      icon: Activity,
      tone: "bg-[#17A2B8]/10 text-[#17A2B8]",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-bold uppercase tracking-normal text-avenue-text-muted">{card.label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-avenue-text-heading">{card.value}</p>
                <p className="mt-2 text-[13px] leading-snug text-avenue-text-muted">{card.detail}</p>
              </div>
              <span className={`rounded-[8px] p-2 ${card.tone}`}>
                <Icon className="h-5 w-5" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Filters({ params, data }: { params: SearchParams; data: RiskData }) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-avenue-text-heading">
        <Filter className="h-4 w-4 text-avenue-indigo" />
        Filter risk profiles
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={filterHref(params, { tier: undefined })}
          className={`rounded-full px-3 py-1 text-[13px] font-bold ${!params.tier ? "bg-avenue-indigo text-white" : "bg-avenue-bg-alt text-avenue-text-heading hover:text-avenue-indigo"}`}
        >
          All tiers
        </Link>
        {Object.values(RiskTier).map((tier) => (
          <Link
            key={tier}
            href={filterHref(params, { tier: params.tier === tier ? undefined : tier })}
            className={`rounded-full px-3 py-1 text-[13px] font-bold ${params.tier === tier ? riskTone(tier) : "bg-avenue-bg-alt text-avenue-text-heading hover:text-avenue-indigo"}`}
          >
            {tier}
          </Link>
        ))}
      </div>

      <form className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]" action="/analytics/risk">
        {params.tier && <input type="hidden" name="tier" value={params.tier} />}
        <select
          name="groupId"
          defaultValue={params.groupId ?? ""}
          className="h-10 rounded-[8px] border border-[#EEEEEE] bg-white px-3 text-sm text-avenue-text-heading outline-none focus:border-avenue-indigo"
        >
          <option value="">All schemes</option>
          {data.groups.map((group) => (
            <option key={group.id} value={group.id}>{group.name}</option>
          ))}
        </select>
        <select
          name="chronicTag"
          defaultValue={params.chronicTag ?? ""}
          className="h-10 rounded-[8px] border border-[#EEEEEE] bg-white px-3 text-sm text-avenue-text-heading outline-none focus:border-avenue-indigo"
        >
          <option value="">All chronic tags</option>
          {data.tagCounts.map((tag) => (
            <option key={tag.tag} value={tag.tag}>{tag.tag} ({tag.count})</option>
          ))}
        </select>
        <select
          name="minUtilization"
          defaultValue={params.minUtilization ?? ""}
          className="h-10 rounded-[8px] border border-[#EEEEEE] bg-white px-3 text-sm text-avenue-text-heading outline-none focus:border-avenue-indigo"
        >
          <option value="">Any cap use</option>
          <option value="0.55">55%+</option>
          <option value="0.8">80%+</option>
          <option value="1">100%+</option>
        </select>
        <select
          name="projectedWithin"
          defaultValue={params.projectedWithin ?? ""}
          className="h-10 rounded-[8px] border border-[#EEEEEE] bg-white px-3 text-sm text-avenue-text-heading outline-none focus:border-avenue-indigo"
        >
          <option value="">Any projection</option>
          <option value="30">Next 30 days</option>
          <option value="60">Next 60 days</option>
          <option value="90">Next 90 days</option>
        </select>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-avenue-indigo px-4 text-sm font-semibold text-white hover:bg-avenue-indigo/90">
          <Filter className="h-4 w-4" />
          Apply
        </button>
      </form>
    </div>
  );
}

function TagPanel({ data, params }: { data: RiskData; params: SearchParams }) {
  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
      <div className="border-b border-[#EEEEEE] px-5 py-4">
        <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Risk Drivers</h2>
        <p className="text-sm text-avenue-text-muted">Most common chronic tags in the current access scope.</p>
      </div>
      <div className="flex flex-wrap gap-2 p-5">
        {data.tagCounts.length === 0 && (
          <p className="text-sm text-avenue-text-muted">No chronic tags are available for this scope.</p>
        )}
        {data.tagCounts.map((tag) => (
          <Link
            key={tag.tag}
            href={filterHref(params, { chronicTag: params.chronicTag === tag.tag ? undefined : tag.tag })}
            className={`rounded-full px-3 py-1 text-[13px] font-bold ${params.chronicTag === tag.tag ? "bg-avenue-indigo text-white" : "bg-avenue-bg-alt text-avenue-text-heading hover:text-avenue-indigo"}`}
          >
            {tag.tag} · {tag.count}
          </Link>
        ))}
      </div>
    </div>
  );
}

function RiskRow({ profile, canViewNamedMembers }: { profile: RiskProfile; canViewNamedMembers: boolean }) {
  const displayName = canViewNamedMembers ? profile.memberName : `Risk ref ${profile.id.slice(-6).toUpperCase()}`;
  const reference = canViewNamedMembers ? profile.memberNumber : "Anonymized member";
  const capWidth = Math.min(100, Math.max(4, profile.utilizationToCap * 100));

  return (
    <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1.4fr_1fr_220px]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[13px] font-bold ${riskTone(profile.riskTier)}`}>{profile.riskTier}</span>
          <span className="rounded-full bg-avenue-bg-alt px-2 py-1 text-[13px] font-semibold text-avenue-text-muted">{reference}</span>
        </div>
        {canViewNamedMembers ? (
          <Link href={`/members/${profile.memberId}`} className="font-heading text-lg font-bold text-avenue-text-heading hover:text-avenue-indigo">
            {displayName}
          </Link>
        ) : (
          <h3 className="font-heading text-lg font-bold text-avenue-text-heading">{displayName}</h3>
        )}
        <p className="mt-1 text-sm text-avenue-text-muted">
          {profile.groupName} · {profile.relationship?.replace(/_/g, " ") ?? "Member"} · {profile.packageName ?? "Package unavailable"}
          {profile.benefitTierName ? ` · ${profile.benefitTierName}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {profile.chronicTags.length === 0 && (
            <span className="rounded-full bg-avenue-bg-alt px-2 py-1 text-[13px] font-semibold text-avenue-text-muted">No chronic tags</span>
          )}
          {profile.chronicTags.map((tag) => (
            <span key={tag} className="rounded-full bg-[#17A2B8]/10 px-2 py-1 text-[13px] font-semibold text-[#17A2B8]">{tag}</span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[13px]">
            <span className="font-semibold text-avenue-text-muted">Utilization to cap</span>
            <span className="font-bold tabular-nums text-avenue-text-heading">{formatPercent(profile.utilizationToCap)}</span>
          </div>
          <div className="h-2 rounded-full bg-[#E6E7E8]">
            <div className={`h-2 rounded-full ${utilizationTone(profile.utilizationToCap)}`} style={{ width: `${capWidth}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <p className="text-avenue-text-muted">Risk score</p>
            <p className="font-bold tabular-nums text-avenue-text-heading">{formatPercent(profile.riskScore)}</p>
          </div>
          <div>
            <p className="text-avenue-text-muted">Claims</p>
            <p className="font-bold tabular-nums text-avenue-text-heading">{profile.trailing12ClaimCount.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="rounded-[8px] bg-[#F8F9FA] p-3 text-[13px]">
        <p className="font-semibold text-avenue-text-muted">Projected exceed</p>
        <p className="mt-1 font-bold text-avenue-text-heading">{formatDate(profile.projectedExceedDate)}</p>
        <p className="mt-3 font-semibold text-avenue-text-muted">Trailing 12 cost</p>
        <p className="mt-1 font-bold tabular-nums text-avenue-text-heading">{formatMoney(profile.trailing12ClaimCost)}</p>
      </div>
    </div>
  );
}

export default async function MemberRiskWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireRole(ROLES.ANY_STAFF);
  const scope = await getAnalyticsAccessScope(session);
  const params = await searchParams;
  const riskTier = enumValue(RiskTier, params.tier);
  const minUtilizationToCap = numberParam(params.minUtilization);
  const projectedWithinDays = numberParam(params.projectedWithin);
  const role = session.user.role as UserRole;
  const canViewNamedMembers = NAMED_RISK_ROLES.includes(role);

  const data = await AnalyticsService.getMemberRiskProfiles(scope, {
    riskTier,
    groupId: params.groupId,
    chronicTag: params.chronicTag,
    minUtilizationToCap,
    projectedWithinDays,
    limit: 150,
  });

  return (
    <div className="space-y-6 font-ui">
      <div>
        <Link href="/analytics" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-avenue-indigo hover:underline">
          <ArrowLeft className="h-4 w-4" />
          Back to analytics
        </Link>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-avenue-indigo">
            <HeartPulse className="h-4 w-4" />
            Strategic Purchasing
          </div>
          <h1 className="font-heading text-3xl font-bold text-avenue-text-heading">Member Risk Workbench</h1>
          <p className="text-avenue-text-muted">Risk-tiered member profiles, chronic drivers, cap pressure, and follow-through links.</p>
        </div>
      </div>

      <MetricCards data={data} />
      <Filters params={params} data={data} />
      <TagPanel data={data} params={params} />

      <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-[#EEEEEE] px-5 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Risk Profile List</h2>
            <p className="text-sm text-avenue-text-muted">{data.profiles.length.toLocaleString()} of {data.summary.total.toLocaleString()} profiles match the current filter.</p>
          </div>
          {(params.tier || params.groupId || params.chronicTag || params.minUtilization || params.projectedWithin) && (
            <Link href="/analytics/risk" className="shrink-0 text-sm font-semibold text-avenue-indigo hover:underline">
              Clear filters
            </Link>
          )}
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {data.profiles.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-avenue-text-muted">No member risk profiles match this filter.</p>
          )}
          {data.profiles.map((profile) => (
            <RiskRow key={profile.id} profile={profile} canViewNamedMembers={canViewNamedMembers} />
          ))}
        </div>
      </div>

      {/* ── Process 14: Bulk care management enrolment ─────── */}
      {data.profiles.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-avenue-text-heading text-sm font-heading flex items-center gap-2">
            <Users size={15} className="text-avenue-indigo" /> Bulk Enrol in Care Management
          </h2>
          <p className="text-xs text-avenue-text-muted">
            Enrol all <strong>{data.profiles.length}</strong> member{data.profiles.length !== 1 ? "s" : ""} matching the current
            filter into a care management programme. This records a health journal note on each member visible to
            their clinical team.
          </p>
          <form action={bulkEnrolCareManagementAction} className="flex gap-3 items-center flex-wrap">
            <input
              type="hidden"
              name="memberIds"
              value={data.profiles.map((p) => p.memberId).join(",")}
            />
            <input
              name="programName"
              type="text"
              required
              placeholder="Programme name (e.g. Diabetes Care, Hypertension Management)"
              className="flex-1 min-w-64 border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-avenue-indigo focus:outline-none"
            />
            <button
              type="submit"
              className="bg-avenue-indigo text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-avenue-secondary transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              <Users size={14} /> Enrol {data.profiles.length} Member{data.profiles.length !== 1 ? "s" : ""}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
