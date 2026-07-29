import { prisma } from "@/lib/prisma";
import type { Prisma, ProviderIntegrationConnection } from "@prisma/client";
import {
  ProviderAccessService,
  type ProviderAccessContext,
} from "@/server/services/provider-access.service";
import { assertSafeOutboundUrl } from "@/lib/url-safety";
import { IntegrationSecretStore } from "./secret-store";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";

/**
 * PNOS F9.3 — connection and credential administration.
 *
 * Authorized integration admins (permission `provider.integrations.manage`)
 * create / configure / test / rotate-secret / activate / pause / disable their
 * OWN provider's integration connections — WITHOUT ever seeing a stored secret.
 * Every scope leg is server-derived from the ProviderAccessContext: the provider
 * is the context's provider (never the input), a branch-scoped connection requires
 * the branch in the actor's context, and no operation can widen provider/branch/
 * scope (§0.4). Outbound endpoints are SSRF-validated. No data is delivered here
 * (F9.3 stop) — the delivery-accepting guard is provided for F9.4.
 */

const PERMISSION = "provider.integrations.manage";
const MODULE = "INTEGRATIONS";
const ENTITY = "PROVIDER_INTEGRATION_CONNECTION";

export type IntegrationAdminErrorCode =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "MISSING_SECRET"
  | "INVALID_CONFIG";

export class IntegrationAdminError extends Error {
  constructor(public code: IntegrationAdminErrorCode, message: string) {
    super(message);
    this.name = "IntegrationAdminError";
  }
}

export type ConnectionMode = "PUSH" | "PULL" | "BIDIRECTIONAL";
export type ConnectionStatus = "DRAFT" | "TESTING" | "ACTIVE" | "PAUSED" | "DISABLED";

// Allowed status transitions (the state machine). DISABLED is terminal.
const TRANSITIONS: Record<ConnectionStatus, ConnectionStatus[]> = {
  DRAFT: ["TESTING", "DISABLED"],
  TESTING: ["ACTIVE", "TESTING", "DISABLED"], // re-test allowed
  ACTIVE: ["PAUSED", "DISABLED"],
  PAUSED: ["ACTIVE", "TESTING", "DISABLED"],
  DISABLED: [],
};

export interface CreateConnectionInput {
  label: string;
  connectorType: string;
  connectorVersion?: string;
  mode?: ConnectionMode;
  providerBranchId?: string; // "" or omitted = provider-level
  apiBaseUrl?: string | null;
  endpointAllowlistRef?: string | null;
  scopes?: string[];
  mappingVersion?: string | null;
  cadence?: string | null;
  owners?: string | null;
  supportInstructions?: string | null;
}

// The read-safe shape — NEVER a secret, secret reference, or cursor.
export interface ConnectionView {
  id: string;
  tenantId: string;
  providerId: string;
  providerBranchId: string;
  label: string;
  connectorType: string;
  connectorVersion: string;
  mode: ConnectionMode;
  apiBaseUrl: string | null;
  endpointAllowlistRef: string | null;
  scopes: string[];
  mappingVersion: string | null;
  cadence: string | null;
  status: ConnectionStatus;
  circuitState: string;
  credentialVersion: number;
  hasActiveSecret: boolean;
  owners: string | null;
  supportInstructions: string | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type ConnectionRow = ProviderIntegrationConnection;

function toView(row: ConnectionRow, hasActiveSecret: boolean): ConnectionView {
  return {
    id: row.id,
    tenantId: row.tenantId,
    providerId: row.providerId,
    providerBranchId: row.providerBranchId,
    label: row.label,
    connectorType: row.connectorType,
    connectorVersion: row.connectorVersion,
    mode: row.mode as ConnectionMode,
    apiBaseUrl: row.apiBaseUrl,
    endpointAllowlistRef: row.endpointAllowlistRef,
    scopes: row.scopes,
    mappingVersion: row.mappingVersion,
    cadence: row.cadence,
    status: row.status as ConnectionStatus,
    circuitState: row.circuitState,
    credentialVersion: row.credentialVersion,
    hasActiveSecret,
    owners: row.owners,
    supportInstructions: row.supportInstructions,
    lastSuccessAt: row.lastSuccessAt,
    lastFailureAt: row.lastFailureAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function audit(
  db: Prisma.TransactionClient | typeof prisma,
  ctx: ProviderAccessContext,
  action: string,
  connectionId: string,
  metadata: Record<string, string | number | boolean | null>,
) {
  await db.auditLog.create({
    data: {
      userId: ctx.actorId,
      tenantId: ctx.tenantId,
      action: `INTEGRATION_CONNECTION:${action}`,
      module: MODULE,
      description: `Integration connection ${action.toLowerCase()} by ${ctx.actorId}`,
      entityType: ENTITY,
      entityId: connectionId,
      metadata,
    },
  });
}

async function notify(ctx: ProviderAccessContext, eventType: string, title: string, body: string, connectionId: string) {
  // PHI-free by construction — connection metadata only, never a payload/secret.
  await NotificationOutboxService.enqueue({
    tenantId: ctx.tenantId,
    channel: "IN_APP",
    eventType,
    title,
    body,
    providerId: ctx.providerId,
    metadata: { connectionId },
    dedupeKey: `${eventType}:${connectionId}`,
  }).catch(() => undefined); // notification must never mask the state change
}

/** Load a connection the actor OWNS (same provider) and is branch-authorized for. */
async function loadOwned(ctx: ProviderAccessContext, id: string): Promise<ConnectionRow> {
  const row = await prisma.providerIntegrationConnection.findFirst({
    where: { id, tenantId: ctx.tenantId },
  });
  // Safe not-found: absent OR out-of-provider look identical (§9.1).
  if (!row || row.providerId !== ctx.providerId) {
    throw new IntegrationAdminError("NOT_FOUND", "No such integration connection");
  }
  // A branch-scoped connection is only manageable by an actor holding that branch.
  if (row.providerBranchId && !ProviderAccessService.hasBranch(ctx, row.providerBranchId)) {
    throw new IntegrationAdminError("NOT_FOUND", "No such integration connection");
  }
  return row;
}

function validateOutboundIfNeeded(mode: ConnectionMode, apiBaseUrl: string | null | undefined, allowlistRef: string | null | undefined) {
  if ((mode === "PULL" || mode === "BIDIRECTIONAL") && apiBaseUrl) {
    try {
      // Allowlist enforcement uses the stored reference only when it names hosts
      // inline (comma-separated); a policy-store handle is resolved at F9.7 runtime.
      const allowlist = allowlistRef && allowlistRef.includes(".") ? allowlistRef.split(",").map((s) => s.trim()) : undefined;
      assertSafeOutboundUrl(apiBaseUrl, { allowlist });
    } catch (e) {
      throw new IntegrationAdminError("INVALID_CONFIG", e instanceof Error ? e.message : "Unsafe endpoint URL");
    }
  }
}

export const ProviderIntegrationConnectionAdmin = {
  TRANSITIONS,

  /** Pure guard for F9.4: only an ACTIVE connection may accept a delivery. */
  assertAcceptsDelivery(connection: { status: string }): void {
    if (connection.status !== "ACTIVE") {
      throw new IntegrationAdminError("INVALID_STATE", `Connection is ${connection.status}; only ACTIVE connections accept deliveries.`);
    }
  },

  assertTransition(from: ConnectionStatus, to: ConnectionStatus): void {
    if (!TRANSITIONS[from].includes(to)) {
      throw new IntegrationAdminError("INVALID_STATE", `Cannot move a connection from ${from} to ${to}.`);
    }
  },

  async create(ctx: ProviderAccessContext, input: CreateConnectionInput): Promise<ConnectionView> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const mode = input.mode ?? "PUSH";
    // Anti-widening: the provider is ALWAYS the context's provider; a branch, when
    // named, must be one the actor already holds — never a self-declared scope.
    const branchId = input.providerBranchId?.trim() || "";
    if (branchId) ProviderAccessService.requireBranch(ctx, branchId);
    validateOutboundIfNeeded(mode, input.apiBaseUrl, input.endpointAllowlistRef);

    const row = await prisma.providerIntegrationConnection.create({
      data: {
        tenantId: ctx.tenantId,
        providerId: ctx.providerId,
        providerBranchId: branchId,
        label: input.label.trim() || "Integration connection",
        connectorType: input.connectorType.trim(),
        connectorVersion: input.connectorVersion?.trim() || "1",
        mode,
        apiBaseUrl: input.apiBaseUrl?.trim() || null,
        endpointAllowlistRef: input.endpointAllowlistRef?.trim() || null,
        scopes: input.scopes ?? [],
        mappingVersion: input.mappingVersion?.trim() || null,
        cadence: input.cadence?.trim() || null,
        owners: input.owners?.trim() || null,
        supportInstructions: input.supportInstructions?.trim() || null,
        status: "DRAFT",
        createdById: ctx.actorId,
      },
    });
    await audit(prisma, ctx, "CREATE", row.id, { connectorType: row.connectorType, mode: row.mode, branch: branchId || "provider-level" });
    await notify(ctx, "INTEGRATION_CONNECTION_CREATED", "Integration connection created", `${row.label} (${row.connectorType}) is in DRAFT.`, row.id);
    return toView(row, false);
  },

  async list(ctx: ProviderAccessContext): Promise<ConnectionView[]> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const rows = await prisma.providerIntegrationConnection.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId },
      orderBy: { createdAt: "desc" },
    });
    // Branch-scoped rows are visible only to an actor holding that branch.
    const visible = rows.filter((r) => !r.providerBranchId || ProviderAccessService.hasBranch(ctx, r.providerBranchId));
    const withSecret = await Promise.all(
      visible.map(async (r) => toView(r, await IntegrationSecretStore.hasActiveSecret(prisma, r.id))),
    );
    return withSecret;
  },

  async get(ctx: ProviderAccessContext, id: string): Promise<ConnectionView> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const row = await loadOwned(ctx, id);
    return toView(row, await IntegrationSecretStore.hasActiveSecret(prisma, row.id));
  },

  async updateConfig(ctx: ProviderAccessContext, id: string, patch: Partial<Omit<CreateConnectionInput, "providerBranchId">>): Promise<ConnectionView> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const row = await loadOwned(ctx, id);
    if (row.status === "DISABLED") throw new IntegrationAdminError("INVALID_STATE", "A disabled connection cannot be reconfigured.");
    const nextMode = (patch.mode ?? row.mode) as ConnectionMode;
    const nextUrl = patch.apiBaseUrl !== undefined ? patch.apiBaseUrl : row.apiBaseUrl;
    const nextAllowlist = patch.endpointAllowlistRef !== undefined ? patch.endpointAllowlistRef : row.endpointAllowlistRef;
    validateOutboundIfNeeded(nextMode, nextUrl, nextAllowlist);

    const updated = await prisma.providerIntegrationConnection.update({
      where: { id: row.id },
      data: {
        label: patch.label?.trim() || undefined,
        connectorType: patch.connectorType?.trim() || undefined,
        connectorVersion: patch.connectorVersion?.trim() || undefined,
        mode: patch.mode ?? undefined,
        apiBaseUrl: patch.apiBaseUrl !== undefined ? (patch.apiBaseUrl?.trim() || null) : undefined,
        endpointAllowlistRef: patch.endpointAllowlistRef !== undefined ? (patch.endpointAllowlistRef?.trim() || null) : undefined,
        scopes: patch.scopes ?? undefined,
        mappingVersion: patch.mappingVersion !== undefined ? (patch.mappingVersion?.trim() || null) : undefined,
        cadence: patch.cadence !== undefined ? (patch.cadence?.trim() || null) : undefined,
        owners: patch.owners !== undefined ? (patch.owners?.trim() || null) : undefined,
        supportInstructions: patch.supportInstructions !== undefined ? (patch.supportInstructions?.trim() || null) : undefined,
      },
    });
    await audit(prisma, ctx, "UPDATE", row.id, { fields: Object.keys(patch).join(",") });
    return toView(updated, await IntegrationSecretStore.hasActiveSecret(prisma, row.id));
  },

  /**
   * Generate (or rotate to) the connection's signing secret. Returns the plaintext
   * EXACTLY ONCE; it is never stored on the connection and never returned again.
   */
  async rotateSecret(ctx: ProviderAccessContext, id: string): Promise<{ connection: ConnectionView; plaintext: string; version: number }> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const row = await loadOwned(ctx, id);
    if (row.status === "DISABLED") throw new IntegrationAdminError("INVALID_STATE", "A disabled connection cannot receive a secret.");

    const result = await prisma.$transaction(async (tx) => {
      const minted = await IntegrationSecretStore.mint(tx, { tenantId: ctx.tenantId, connectionId: row.id, createdById: ctx.actorId });
      const updated = await tx.providerIntegrationConnection.update({
        where: { id: row.id },
        data: { secretRef: minted.secretId, credentialVersion: minted.version },
      });
      // Audit records the VERSION only — never the secret material.
      await audit(tx, ctx, "SECRET_ROTATE", row.id, { credentialVersion: minted.version });
      return { updated, minted };
    });
    return { connection: toView(result.updated, true), plaintext: result.minted.plaintext, version: result.minted.version };
  },

  /**
   * Test the connection config: validate completeness + endpoint safety + secret
   * presence, and record the health stamp. NO live call is made (F9.3 stop — no
   * data delivery). On success the connection moves to TESTING.
   */
  async test(ctx: ProviderAccessContext, id: string): Promise<ConnectionView> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const row = await loadOwned(ctx, id);
    ProviderIntegrationConnectionAdmin.assertTransition(row.status as ConnectionStatus, "TESTING");

    const problems: string[] = [];
    const hasSecret = await IntegrationSecretStore.hasActiveSecret(prisma, row.id);
    if (!hasSecret) problems.push("no active secret");
    if ((row.mode === "PULL" || row.mode === "BIDIRECTIONAL")) {
      if (!row.apiBaseUrl) problems.push("no endpoint URL");
      else {
        try {
          const allowlist = row.endpointAllowlistRef && row.endpointAllowlistRef.includes(".") ? row.endpointAllowlistRef.split(",").map((s) => s.trim()) : undefined;
          assertSafeOutboundUrl(row.apiBaseUrl, { allowlist });
        } catch (e) {
          problems.push(e instanceof Error ? e.message : "unsafe endpoint");
        }
      }
    }

    const ok = problems.length === 0;
    const updated = await prisma.providerIntegrationConnection.update({
      where: { id: row.id },
      data: ok
        ? { status: "TESTING", lastSuccessAt: new Date() }
        : { lastFailureAt: new Date() },
    });
    await audit(prisma, ctx, ok ? "TEST_OK" : "TEST_FAIL", row.id, { problems: problems.join("; ") || "none" });
    if (!ok) throw new IntegrationAdminError("INVALID_CONFIG", `Connection test failed: ${problems.join("; ")}`);
    return toView(updated, hasSecret);
  },

  async activate(ctx: ProviderAccessContext, id: string): Promise<ConnectionView> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const row = await loadOwned(ctx, id);
    ProviderIntegrationConnectionAdmin.assertTransition(row.status as ConnectionStatus, "ACTIVE");
    const hasSecret = await IntegrationSecretStore.hasActiveSecret(prisma, row.id);
    if (!hasSecret) throw new IntegrationAdminError("MISSING_SECRET", "A connection needs an active secret before activation.");
    const updated = await prisma.providerIntegrationConnection.update({ where: { id: row.id }, data: { status: "ACTIVE" } });
    await audit(prisma, ctx, "ACTIVATE", row.id, {});
    await notify(ctx, "INTEGRATION_CONNECTION_ACTIVATED", "Integration connection active", `${row.label} is now ACTIVE.`, row.id);
    return toView(updated, true);
  },

  async pause(ctx: ProviderAccessContext, id: string): Promise<ConnectionView> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const row = await loadOwned(ctx, id);
    ProviderIntegrationConnectionAdmin.assertTransition(row.status as ConnectionStatus, "PAUSED");
    const updated = await prisma.providerIntegrationConnection.update({ where: { id: row.id }, data: { status: "PAUSED" } });
    await audit(prisma, ctx, "PAUSE", row.id, {});
    return toView(updated, await IntegrationSecretStore.hasActiveSecret(prisma, row.id));
  },

  async resume(ctx: ProviderAccessContext, id: string): Promise<ConnectionView> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const row = await loadOwned(ctx, id);
    ProviderIntegrationConnectionAdmin.assertTransition(row.status as ConnectionStatus, "ACTIVE");
    const updated = await prisma.providerIntegrationConnection.update({ where: { id: row.id }, data: { status: "ACTIVE" } });
    await audit(prisma, ctx, "RESUME", row.id, {});
    return toView(updated, await IntegrationSecretStore.hasActiveSecret(prisma, row.id));
  },

  async disable(ctx: ProviderAccessContext, id: string): Promise<ConnectionView> {
    ProviderAccessService.requirePermission(ctx, PERMISSION);
    const row = await loadOwned(ctx, id);
    ProviderIntegrationConnectionAdmin.assertTransition(row.status as ConnectionStatus, "DISABLED");
    const updated = await prisma.providerIntegrationConnection.update({ where: { id: row.id }, data: { status: "DISABLED" } });
    await audit(prisma, ctx, "DISABLE", row.id, {});
    await notify(ctx, "INTEGRATION_CONNECTION_DISABLED", "Integration connection disabled", `${row.label} was disabled.`, row.id);
    return toView(updated, await IntegrationSecretStore.hasActiveSecret(prisma, row.id));
  },
} as const;
