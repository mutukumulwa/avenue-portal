import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — unauthenticated liveness + readiness probe for uptime
 * monitoring (FULL GO closure plan WP-6). Reports:
 *  - db:    a real round-trip to Postgres (SELECT 1)
 *  - defaultClientPresent: the `default`-slug Client that group creation and
 *    quote→bind fall back to (resolveSchemeClientId fails loud without it —
 *    surfacing it here turns a bind-time 500 into a monitorable signal)
 *  - version: deployed commit (Vercel build metadata)
 * No tenant names, counts, or PII — booleans and build metadata only.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [defaultClient, workerBeat] = await Promise.all([
      prisma.client.findFirst({ where: { slug: "default" }, select: { id: true } }),
      // WP-7: the background worker upserts a heartbeat row every 60s.
      // workerFresh=false (or lastSeenAt=null) means the async job layer —
      // escalations, membership activation, lapse detection, fund alerts,
      // analytics — is NOT running.
      prisma.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true, host: true } }),
    ]);
    return NextResponse.json({
      ok: true,
      db: "up",
      defaultClientPresent: defaultClient !== null,
      workerLastSeenAt: workerBeat?.lastSeenAt?.toISOString() ?? null,
      workerFresh: workerBeat != null && Date.now() - workerBeat.lastSeenAt.getTime() < 5 * 60_000,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
