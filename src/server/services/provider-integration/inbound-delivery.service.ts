import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { IntegrationSecretStore } from "./secret-store";

/**
 * PNOS F9.4 — durable inbound delivery receipt.
 *
 * Every accepted inbound request is authenticated, validated, and DURABLY RECORDED
 * before any domain processing (§8.12). The delivery row IS the queue: an ACCEPTED
 * delivery with a nextAttemptAt is picked up later by the F9.5 mapper / F9.6 sweeper
 * from durable DB state — so an accepted receipt survives a queue outage or an app
 * crash after the receipt with no external broker in the critical path. This service
 * NEVER applies to a domain service (F9.4 stop: no HMS apply) and NEVER stores or
 * logs the raw body — only a hash.
 *
 * Authentication here is connection + shared-secret (bcrypt-verified via the F9.3
 * store) + replay window + idempotency/hash conflict. A cryptographic body-HMAC
 * (which binds the signature to the payload bytes and needs a reversibly-stored
 * per-connector signing key) is a F9.7 refinement, negotiated with the real partner
 * — the same reasoning that defers reversible secret storage to F9.7.
 */

const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000; // ±5 min clock-skew tolerance
const DEFAULT_MAX_BODY_BYTES = 1_000_000; // 1 MB
const STATUS_URL_BASE = "/api/v1/integration/deliveries";
const JSON_CONTENT_TYPE = "application/json";

export type InboundDeliveryErrorCode =
  | "NOT_FOUND"
  | "INACTIVE"
  | "UNAUTHENTICATED"
  | "FORBIDDEN_SCOPE"
  | "CLOCK_SKEW"
  | "UNSUPPORTED_MEDIA"
  | "OVERSIZE"
  | "SCHEMA"
  | "CONFLICT"
  | "INVALID_INPUT";

export class InboundDeliveryError extends Error {
  constructor(public code: InboundDeliveryErrorCode, message: string) {
    super(message);
    this.name = "InboundDeliveryError";
  }
}

export interface ReceiveDeliveryInput {
  connectionId: string;
  /** The shared secret presented by the caller (bearer credential). */
  presentedSecret: string;
  /** Caller-asserted send time (ISO) — checked against the replay window. */
  timestamp: string;
  /** Caller-stable key; one durable delivery per (connection, key). */
  idempotencyKey: string;
  businessObjectType: string;
  /** The exact request body bytes (JSON). Hashed, never stored/logged raw. */
  rawBody: string;
  contentType: string;
  externalBatchRef?: string;
  externalRef?: string;
  /** Declared control totals (reconciled against applied results in F9.5). */
  recordCount?: number;
  amountTotal?: string | number;
}

export interface DeliveryReceipt {
  deliveryId: string;
  connectionId: string;
  status: string;
  replayed: boolean;
  statusUrl: string;
  recordCount: number | null;
}

export interface ReceiveDeps {
  now?: Date;
  replayWindowMs?: number;
  maxBodyBytes?: number;
  /**
   * Best-effort fast-path enqueue after a delivery is durably ACCEPTED. If it
   * throws (queue outage), the delivery is ALREADY durable — the throw is swallowed
   * and the F9.6 sweeper drains the delivery from DB state.
   */
  onAccepted?: (deliveryId: string) => Promise<void> | void;
}

function isUniqueViolation(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";
}

function normalizedHash(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

export const InboundDeliveryService = {
  STATUS_URL_BASE,

  /**
   * Durably record an inbound delivery. Returns a receipt (with a status URL) for a
   * fresh accept OR an idempotent replay; throws InboundDeliveryError with no
   * mutation for every rejection (auth, scope, skew, oversize, schema, conflict).
   */
  async receive(input: ReceiveDeliveryInput, deps: ReceiveDeps = {}): Promise<DeliveryReceipt> {
    const now = deps.now ?? new Date();
    const replayWindowMs = deps.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS;
    const maxBodyBytes = deps.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

    // ── presence ──────────────────────────────────────────────────────────────
    if (!input.connectionId || !input.presentedSecret || !input.idempotencyKey || !input.businessObjectType) {
      throw new InboundDeliveryError("INVALID_INPUT", "connectionId, presentedSecret, idempotencyKey and businessObjectType are required.");
    }

    // ── resolve connection (server-derived scope; never trust the body) ─────────
    const connection = await prisma.providerIntegrationConnection.findFirst({
      where: { id: input.connectionId },
      select: { id: true, tenantId: true, providerId: true, providerBranchId: true, status: true, scopes: true, mode: true },
    });
    if (!connection) throw new InboundDeliveryError("NOT_FOUND", "No such integration connection.");
    if (connection.status !== "ACTIVE") throw new InboundDeliveryError("INACTIVE", `Connection is ${connection.status}; only ACTIVE connections accept deliveries.`);
    if (connection.mode === "PULL") throw new InboundDeliveryError("FORBIDDEN_SCOPE", "A PULL connection does not accept inbound push deliveries.");

    // ── authenticate (connection secret) ────────────────────────────────────────
    const authed = await IntegrationSecretStore.verify(prisma, connection.id, input.presentedSecret);
    if (!authed) throw new InboundDeliveryError("UNAUTHENTICATED", "Invalid connection credential.");

    // ── scope ───────────────────────────────────────────────────────────────────
    if (connection.scopes.length > 0 && !connection.scopes.includes(input.businessObjectType)) {
      throw new InboundDeliveryError("FORBIDDEN_SCOPE", `This connection is not scoped for ${input.businessObjectType}.`);
    }

    // ── replay window (clock skew) ──────────────────────────────────────────────
    const ts = new Date(input.timestamp);
    if (Number.isNaN(ts.getTime())) throw new InboundDeliveryError("SCHEMA", "Invalid timestamp.");
    if (Math.abs(now.getTime() - ts.getTime()) > replayWindowMs) {
      throw new InboundDeliveryError("CLOCK_SKEW", "Request timestamp is outside the accepted window.");
    }

    // ── content type + body size + schema (before unbounded processing) ─────────
    if (!input.contentType || !input.contentType.toLowerCase().includes(JSON_CONTENT_TYPE)) {
      throw new InboundDeliveryError("UNSUPPORTED_MEDIA", "Only application/json is accepted.");
    }
    if (Buffer.byteLength(input.rawBody ?? "", "utf8") > maxBodyBytes) {
      throw new InboundDeliveryError("OVERSIZE", "Request body exceeds the maximum size.");
    }
    try {
      JSON.parse(input.rawBody);
    } catch {
      throw new InboundDeliveryError("SCHEMA", "Body is not well-formed JSON.");
    }

    // ── normalize identity/hash/control totals ──────────────────────────────────
    const hash = normalizedHash(input.rawBody);
    const recordCount = input.recordCount ?? null;
    const amountTotal = input.amountTotal !== undefined ? String(input.amountTotal) : null;

    // ── create / replay / conflict (concurrency-safe via @@unique) ──────────────
    const existing = await prisma.providerIntegrationDelivery.findFirst({
      where: { connectionId: connection.id, idempotencyKey: input.idempotencyKey },
      select: { id: true, status: true, normalizedPayloadHash: true, recordCount: true },
    });
    if (existing) return this.decide(existing, hash, connection.id);

    let created;
    try {
      created = await prisma.providerIntegrationDelivery.create({
        data: {
          tenantId: connection.tenantId,
          connectionId: connection.id,
          providerId: connection.providerId, // server-derived from the connection
          providerBranchId: connection.providerBranchId,
          direction: "INBOUND",
          businessObjectType: input.businessObjectType,
          externalBatchRef: input.externalBatchRef ?? null,
          externalRef: input.externalRef ?? null,
          idempotencyKey: input.idempotencyKey,
          normalizedPayloadHash: hash,
          recordCount,
          amountTotal,
          // Durably ACCEPTED and ready for processing FROM DB STATE (F9.5/F9.6);
          // no domain apply here (F9.4 stop).
          status: "ACCEPTED",
          nextAttemptAt: now,
          receivedAt: now,
        },
        select: { id: true, status: true, recordCount: true },
      });
    } catch (e) {
      // A concurrent request won the unique race — re-read and decide replay/conflict.
      if (isUniqueViolation(e)) {
        const raced = await prisma.providerIntegrationDelivery.findFirst({
          where: { connectionId: connection.id, idempotencyKey: input.idempotencyKey },
          select: { id: true, status: true, normalizedPayloadHash: true, recordCount: true },
        });
        if (raced) return this.decide(raced, hash, connection.id);
      }
      throw e;
    }

    // Best-effort fast-path enqueue; the delivery is already durable if this throws.
    try {
      await deps.onAccepted?.(created.id);
    } catch {
      // swallow — a queue outage must not undo an accepted, durable receipt.
    }

    return {
      deliveryId: created.id,
      connectionId: connection.id,
      status: created.status,
      replayed: false,
      statusUrl: `${STATUS_URL_BASE}/${created.id}`,
      recordCount: created.recordCount,
    };
  },

  /** Same key + same hash → idempotent replay; same key + different hash → conflict. */
  decide(
    existing: { id: string; status: string; normalizedPayloadHash: string; recordCount: number | null },
    hash: string,
    connectionId: string,
  ): DeliveryReceipt {
    if (existing.normalizedPayloadHash !== hash) {
      throw new InboundDeliveryError("CONFLICT", "This idempotency key was already used with a different body.");
    }
    return {
      deliveryId: existing.id,
      connectionId,
      status: existing.status,
      replayed: true,
      statusUrl: `${STATUS_URL_BASE}/${existing.id}`,
      recordCount: existing.recordCount,
    };
  },

  /**
   * Read a delivery's safe receipt for the status URL. Scoped to its connection
   * (non-enumerating: a wrong connection returns null). Never returns a payload or
   * secret — only status/counts/timestamps.
   */
  async getReceipt(connectionId: string, deliveryId: string) {
    const row = await prisma.providerIntegrationDelivery.findFirst({
      where: { id: deliveryId, connectionId },
      select: {
        id: true, status: true, businessObjectType: true,
        recordCount: true, amountTotal: true,
        appliedCount: true, rejectedCount: true, quarantinedCount: true, replayedCount: true,
        receivedAt: true, completedAt: true,
      },
    });
    if (!row) return null;
    return { deliveryId: row.id, ...row, statusUrl: `${STATUS_URL_BASE}/${row.id}` };
  },
} as const;
