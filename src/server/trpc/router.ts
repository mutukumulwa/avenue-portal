import { createTRPCRouter, publicProcedure } from "./trpc";
import { packagesRouter } from "./routers/packages";
import { groupsRouter } from "./routers/groups";
import { membersRouter } from "./routers/members";
import { endorsementsRouter } from "./routers/endorsements";
import { claimsRouter } from "./routers/claims";
import { preauthRouter } from "./routers/preauth";
import { billingRouter } from "./routers/billing";
import { providersRouter } from "./routers/providers";
import { brokersRouter } from "./routers/brokers";
import { quotationsRouter } from "./routers/quotations";
import { reportsRouter } from "./routers/reports";
import { settingsRouter } from "./routers/settings";
import { coContributionRouter } from "./routers/coContribution";
import { analyticsRouter } from "./routers/analytics";
import { memberAppRouter } from "./routers/memberApp";
import { pricingRouter } from "./routers/pricing";
import { rolesRouter } from "./routers/roles";
import { overridesRouter } from "./routers/overrides";
import { auditChainRouter } from "./routers/auditChain";
import { intakeRouter } from "./routers/intake";
import { bindingRouter } from "./routers/binding";
import { terminologyRouter } from "./routers/terminology";
import { crossBorderRouter } from "./routers/crossBorder";

export const appRouter = createTRPCRouter({
  healthcheck: publicProcedure.query(() => {
    return "ok";
  }),
  packages: packagesRouter,
  groups: groupsRouter,
  members: membersRouter,
  endorsements: endorsementsRouter,
  claims: claimsRouter,
  preauth: preauthRouter,
  billing: billingRouter,
  providers: providersRouter,
  brokers: brokersRouter,
  quotations: quotationsRouter,
  reports: reportsRouter,
  analytics: analyticsRouter,
  memberApp: memberAppRouter,
  settings: settingsRouter,
  coContribution: coContributionRouter,
  pricing: pricingRouter,
  roles: rolesRouter,
  overrides: overridesRouter,
  auditChain: auditChainRouter,
  intake: intakeRouter,
  binding: bindingRouter,
  terminology: terminologyRouter,
  crossBorder: crossBorderRouter,
});

export type AppRouter = typeof appRouter;
