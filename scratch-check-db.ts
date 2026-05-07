import 'dotenv/config';
import { prisma } from './src/lib/prisma';
async function main() {
  const encounterFacts = await prisma.analyticsEncounterFact.count();
  const contributionFacts = await prisma.analyticsContributionFact.count();
  const mlrSnapshots = await prisma.analyticsMlrSnapshot.count();
  const providerScorecards = await prisma.providerScorecard.count();
  const memberRiskProfiles = await prisma.memberRiskProfile.count();
  const renewalAnalyses = await prisma.renewalAnalysis.count();
  const analyticsAlerts = await prisma.analyticsAlert.count();

  console.log('Analytics Tables Row Counts:');
  console.log(`AnalyticsEncounterFact: ${encounterFacts}`);
  console.log(`AnalyticsContributionFact: ${contributionFacts}`);
  console.log(`AnalyticsMlrSnapshot: ${mlrSnapshots}`);
  console.log(`ProviderScorecard: ${providerScorecards}`);
  console.log(`MemberRiskProfile: ${memberRiskProfiles}`);
  console.log(`RenewalAnalysis: ${renewalAnalyses}`);
  console.log(`AnalyticsAlert: ${analyticsAlerts}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
