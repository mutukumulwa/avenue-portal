import { prisma } from "@/lib/prisma";
import { safeFetchText, type SafeFetchDeps } from "@/lib/http-safe";
import { InboundDeliveryService, InboundDeliveryError } from "./inbound-delivery.service";
import { CaseServiceDeliveryProcessor, DeliveryProcessError } from "./delivery-processor.service";

/**
 * PNOS F9.7 — outbound pull adapter for ONE object type (CASE_SERVICE), feeding
 * the SAME durable inbound rail as the push path (F9.4 receipt → F9.5 processor).
 *
 * Safety invariants:
 *  - fetch only through the SSRF-safe transport (HTTPS + allowlist + runtime
 *    DNS-rebind check + timeout + body cap + no redirects);
 *  - the CURSOR advances only after the fetched page is durably ACCEPTED *and*
 *    processed (idempotently) — so a crash before that boundary re-fetches the
 *    same page and replays it, never losing or double-applying data;
 *  - a bounded circuit breaker opens after N consecutive transport failures and
 *    half-opens after a cool-down.
 *
 * GATED: no real endpoint is polled until the F9.7 pilot activation (signed
 * contract + sandbox). This is the transport + orchestration + tests only; the
 * scheduler does NOT invoke it against a live connection.
 */

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const OBJECT_TYPE = "CASE_SERVICE";

export interface PullPage {
  entries: unknown[];
  nextCursor?: string | null;
}

export interface PollDeps {
  now?: Date;
  transport?: SafeFetchDeps;
  failureThreshold?: number;
  cooldownMs?: number;
}

export type PollOutcome =
  | { status: "skipped"; reason: string }
  | { status: "circuit-open" }
  | { status: "error"; reason: string; circuit: string }
  | { status: "ok"; deliveryId: string; replayed: boolean; cursor: string | null; total: number; applied: number; reconciled: boolean };

function buildPageUrl(base: string, cursor: string | null): string {
  if (!cursor) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}cursor=${encodeURIComponent(cursor)}`;
}

function safeMsg(e: unknown): string {
  return e instanceof Error ? e.message : "pull failed";
}

export const CaseServicePullAdapter = {
  OBJECT_TYPE,

  /**
   * Poll one page from a connection's endpoint and feed it through the durable
   * inbound rail. Returns the outcome; advances the cursor only past the durable
   * accepted+processed boundary.
   */
  async pollOnce(connectionId: string, deps: PollDeps = {}): Promise<PollOutcome> {
    const now = deps.now ?? new Date();
    const threshold = deps.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;

    const conn = await prisma.providerIntegrationConnection.findFirst({
      where: { id: connectionId },
      select: {
        id: true, tenantId: true, providerId: true, providerBranchId: true, status: true, scopes: true, mode: true,
        apiBaseUrl: true, endpointAllowlistRef: true, cursor: true, circuitState: true, circuitOpenedAt: true, consecutiveFailures: true,
      },
    });
    if (!conn) return { status: "skipped", reason: "not found" };
    if (conn.status !== "ACTIVE") return { status: "skipped", reason: `connection ${conn.status}` };
    if (conn.mode === "PUSH") return { status: "skipped", reason: "push connection is not pulled" };
    if (!conn.apiBaseUrl) return { status: "skipped", reason: "no endpoint URL" };

    // ── circuit breaker ─────────────────────────────────────────────────────────
    if (conn.circuitState === "OPEN") {
      const elapsed = conn.circuitOpenedAt ? now.getTime() - conn.circuitOpenedAt.getTime() : Number.POSITIVE_INFINITY;
      if (elapsed < cooldownMs) return { status: "circuit-open" };
      await prisma.providerIntegrationConnection.update({ where: { id: conn.id }, data: { circuitState: "HALF_OPEN" } }); // allow one trial
    }

    // ── fetch (SSRF-safe) ───────────────────────────────────────────────────────
    const allowlist = conn.endpointAllowlistRef && conn.endpointAllowlistRef.includes(".") ? conn.endpointAllowlistRef.split(",").map((s) => s.trim()) : undefined;
    let page: PullPage;
    try {
      const res = await safeFetchText(buildPageUrl(conn.apiBaseUrl, conn.cursor), { allowlist }, deps.transport ?? {});
      if (res.status >= 400) throw new Error(`upstream responded ${res.status}`);
      const parsed = JSON.parse(res.body) as PullPage;
      if (!parsed || !Array.isArray(parsed.entries)) throw new Error("page.entries[] missing");
      page = parsed;
    } catch (e) {
      const failures = conn.consecutiveFailures + 1;
      const open = failures >= threshold;
      await prisma.providerIntegrationConnection.update({
        where: { id: conn.id },
        data: { consecutiveFailures: failures, lastFailureAt: now, ...(open ? { circuitState: "OPEN", circuitOpenedAt: now } : {}) },
      });
      return { status: "error", reason: safeMsg(e), circuit: open ? "OPEN" : conn.circuitState };
    }

    // ── durable receipt (cursor NOT advanced yet) ───────────────────────────────
    const rawBody = JSON.stringify({ entries: page.entries });
    const idempotencyKey = `pull:${conn.id}:${conn.cursor ?? "start"}`;
    let receipt;
    try {
      receipt = await InboundDeliveryService.receivePulled(
        conn,
        { businessObjectType: OBJECT_TYPE, rawBody, idempotencyKey, externalBatchRef: conn.cursor ?? null, recordCount: page.entries.length },
        { now },
      );
    } catch (e) {
      // A same-cursor/different-body conflict is a source integrity problem — do NOT
      // advance the cursor; surface it. (Fetch succeeded, so the transport is healthy.)
      if (e instanceof InboundDeliveryError) {
        await prisma.providerIntegrationConnection.update({ where: { id: conn.id }, data: { circuitState: "CLOSED", circuitOpenedAt: null, consecutiveFailures: 0, lastSuccessAt: now } });
        return { status: "error", reason: `receipt: ${e.code}`, circuit: "CLOSED" };
      }
      throw e;
    }

    // The transport succeeded — clear the circuit.
    await prisma.providerIntegrationConnection.update({ where: { id: conn.id }, data: { circuitState: "CLOSED", circuitOpenedAt: null, consecutiveFailures: 0, lastSuccessAt: now } });

    // ── process idempotently from durable state ─────────────────────────────────
    let report: Awaited<ReturnType<typeof CaseServiceDeliveryProcessor.process>> | null = null;
    try {
      report = await CaseServiceDeliveryProcessor.process(receipt.deliveryId, rawBody);
    } catch (e) {
      // A replay whose prior processing already terminalized ⇒ nothing to do.
      if (!(e instanceof DeliveryProcessError && e.code === "NOT_PROCESSABLE")) throw e;
    }

    // ── advance the cursor ONLY after the durable accepted + processed boundary ──
    const nextCursor = page.nextCursor ?? conn.cursor;
    await prisma.providerIntegrationConnection.update({ where: { id: conn.id }, data: { cursor: nextCursor } });

    // ── reconcile source count vs per-record outcomes ───────────────────────────
    const total = page.entries.length;
    const reconciled = report
      ? report.applied + report.replayed + report.unmatched + report.rejected + report.quarantined + report.retrying === total
      : true; // already-terminal replay: the delivery aggregate was reconciled on the first pass
    return { status: "ok", deliveryId: receipt.deliveryId, replayed: receipt.replayed, cursor: nextCursor, total, applied: report?.applied ?? 0, reconciled };
  },
} as const;
