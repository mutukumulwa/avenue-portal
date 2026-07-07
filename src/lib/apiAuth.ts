import { NextResponse } from "next/server";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";

export type ApiCredential =
  | { kind: "operator" }
  | { kind: "provider"; tenantId: string; providerId: string; keyId: string };

function extractKey(req: Request): string | null {
  const raw = req.headers.get("authorization") || req.headers.get("x-api-key");
  if (!raw) return null;
  return raw.replace(/^Bearer\s+/i, "").trim();
}

/**
 * Resolve the caller's API credential. Two channels are honoured:
 *  - the operator/global integration key (process.env.API_KEY) — spans the tenant;
 *  - a per-facility ProviderApiKey — confines the request to one Provider so an
 *    HMS submission is always attributed to (and can only act as) that facility.
 * Returns null when no valid key is presented.
 */
export async function getApiCredential(req: Request): Promise<ApiCredential | null> {
  const key = extractKey(req);
  if (!key) return null;

  const OPERATOR_KEY = process.env.API_KEY || "av-slade360-dev-key";
  if (key === OPERATOR_KEY) return { kind: "operator" };

  const provider = await ProviderApiKeyService.verify(key);
  if (provider) return { kind: "provider", ...provider };

  return null;
}

/** Back-compat boolean gate — now also accepts per-provider keys. */
export async function validateApiKey(req: Request): Promise<boolean> {
  return (await getApiCredential(req)) !== null;
}

/**
 * Prisma where-fragment confining a member/eligibility/benefits lookup to the
 * tenant the presented key belongs to. A per-facility key may only resolve
 * members of its own tenant — the same entitlement boundary the POST create
 * path enforces (provider.tenantId === member.tenantId). The operator/global
 * key spans the tenant, so no confinement is added. A null credential (which
 * withApiKey never passes through) confines to an impossible tenant so a
 * misuse fails closed rather than leaking every tenant.
 */
export function tenantScopeWhere(credential: ApiCredential | null): { tenantId?: string } {
  if (!credential) return { tenantId: "__unauthorized__" };
  return credential.kind === "provider" ? { tenantId: credential.tenantId } : {};
}

/**
 * Prisma where-fragment confining a claim-status lookup to the facility the
 * presented key belongs to. A per-facility key may only read its own claims;
 * anything else returns the existing "not found" (404) shape. The operator key
 * spans the tenant. A null credential fails closed (see tenantScopeWhere).
 */
export function providerScopeWhere(credential: ApiCredential | null): { providerId?: string } {
  if (!credential) return { providerId: "__unauthorized__" };
  return credential.kind === "provider" ? { providerId: credential.providerId } : {};
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
