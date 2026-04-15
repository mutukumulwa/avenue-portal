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
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
