import { AnalyticsRefreshService } from "../services/analytics-refresh.service";

export async function runAnalyticsRefreshJob(payload: { tenantId?: string } = {}) {
  console.info("[analytics-refresh] Refreshing strategic purchasing analytics foundation...");

  const result = await AnalyticsRefreshService.refreshFoundation({
    tenantId: payload.tenantId,
  });

  console.info(
    `[analytics-refresh] Refreshed ${result.caseMixWeights} case-mix weight(s), ` +
      `${result.encounterFacts.facts} encounter fact(s), ` +
      `${result.contributionFacts.facts} contribution fact(s), ` +
      `${result.mlrSnapshots.snapshots} MLR snapshot(s), ` +
      `${result.providerScorecards.scorecards} provider scorecard row(s), ` +
      `${result.memberRiskProfiles.riskProfiles} member risk profile(s), ` +
      `${result.renewalAnalyses.renewalAnalyses} renewal analysis row(s), ` +
      `${result.analyticsAlerts.alerts} analytics alert(s).`,
  );

  return result;
}
