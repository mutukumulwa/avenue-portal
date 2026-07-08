import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";

export type ApiCredential =
  | { kind: "operator"; tenantId?: string }
  | { kind: "provider"; tenantId: string; providerId: string; keyId: string };

function extractKey(req: Request): string | null {
  const raw = req.headers.get("authorization") || req.headers.get("x-api-key");
  if (!raw) return null;
  return raw.replace(/^Bearer\s+/i, "").trim();
}

/**
 * The operator/global integration key, read from the environment at call time.
 *
 * BD-06: there is deliberately NO in-source default. An unset (or empty) API_KEY
 * disables the operator channel and fails closed — it never falls back to a
 * guessable shared secret, so a misconfigured deploy cannot ship a live default
 * credential that grants unscoped, cross-tenant read/write.
 */
function operatorKey(): string | null {
  const configured = process.env.API_KEY?.trim();
  return configured ? configured : null;
}

/** Constant-time string comparison that never throws on a length mismatch. */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Resolve the caller's API credential. Two channels are honoured:
 *  - the operator/global integration key (process.env.API_KEY) — must be
 *    explicitly configured (no default). When OPERATOR_TENANT_ID is set the
 *    credential is bound to that tenant so it cannot silently span additional
 *    tenants; per-facility keys are the preferred integration path.
 *  - a per-facility ProviderApiKey — confines the request to one Provider so an
 *    HMS submission is always attributed to (and can only act as) that facility.
 * Returns null when no valid key is presented.
 */
export async function getApiCredential(req: Request): Promise<ApiCredential | null> {
  const key = extractKey(req);
  if (!key) return null;

  const opKey = operatorKey();
  if (opKey && secretsMatch(key, opKey)) {
    const tenantId = process.env.OPERATOR_TENANT_ID?.trim();
    return tenantId ? { kind: "operator", tenantId } : { kind: "operator" };
  }

  const provider = await ProviderApiKeyService.verify(key);
  if (provider) return { kind: "provider", ...provider };

  return null;
}

/** Back-compat boolean gate — now also accepts per-provider keys. */
export async function validateApiKey(req: Request): Promise<boolean> {
  return (await getApiCredential(req)) !== null;
}

/**
 * Prisma where-fragment confining a claim-status lookup to the facility the
 * presented key belongs to. A per-facility key may only read its own claims;
 * anything else returns the existing "not found" (404) shape. The operator key
 * spans the tenant. A null credential (which withApiKey never passes through)
 * fails closed via an impossible providerId rather than leaking every claim.
 *
 * Member reads (eligibility / benefits) use a richer client-entitlement scope —
 * see ProviderEntitlementService — because in production clients are separated
 * by Client/Group, not by tenant.
 */
export function providerScopeWhere(credential: ApiCredential | null): { providerId?: string } {
  if (!credential) return { providerId: "__unauthorized__" };
  return credential.kind === "provider" ? { providerId: credential.providerId } : {};
}

/**
 * BD-06: tenant-confinement for the operator key. Both Member and Claim carry a
 * `tenantId`, so a where-fragment of `{ tenantId }` pins an operator request to
 * its bound tenant. Returns `{}` for provider keys (they carry their own,
 * richer scope) and for an unbound operator (no OPERATOR_TENANT_ID) — preserving
 * the legacy single-operator behaviour until the binding is configured.
 */
export function operatorTenantWhere(credential: ApiCredential | null): { tenantId?: string } {
  return credential?.kind === "operator" && credential.tenantId
    ? { tenantId: credential.tenantId }
    : {};
}

/**
 * Wrapper for B2B API endpoints ensuring stateless API-key auth. Handlers that
 * need the resolved facility can call getApiCredential(req) themselves.
 */
export function withApiKey(handler: (req: Request, ...args: unknown[]) => Promise<Response>) {
  return async (req: Request, ...args: unknown[]) => {
    if (!(await validateApiKey(req))) {
      return NextResponse.json({ error: "Unauthorized. Invalid or missing API Key." }, { status: 401 });
    }
    return handler(req, ...args);
  };
}
