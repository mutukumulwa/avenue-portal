"use server";

/**
 * Family Hospital UAT plan P02.02 / P02.03 / P03.02 — the provider capture
 * lookups, as Server Actions.
 *
 * Server Actions are POST-only public endpoints (vendored Next 15.5.15 guide,
 * 01-app/02-guides/data-security.mdx), which is exactly why they are used here:
 * a member number travels in a POST body, never in a URL, a query string or an
 * access log (plan §4 rule 5). Each call re-authenticates, re-derives tenant,
 * provider, permissions and branches from the session, and validates its input
 * in the service — nothing from the browser establishes scope.
 *
 * `"use server"` files may export async functions only (AGENTS.md); the shared
 * types live in src/lib/provider-capture-contract.ts.
 */
import { randomUUID } from "node:crypto";
import { isProviderAccessError, ProviderAccessService, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { ProviderCaseContextService } from "@/server/services/provider-case-context.service";
import { ProviderServiceCatalogService } from "@/server/services/provider-service-catalog.service";
import { ProviderDiagnosisSearchService } from "@/server/services/provider-diagnosis-search.service";
import type {
  CaseContextRequest,
  CaseContextResult,
  DiagnosisSearchResult,
  ServiceSearchRequest,
  ServiceSearchResult,
} from "@/lib/provider-capture-contract";

/**
 * The session's provider context, or null when the account is not a usable
 * provider user. Kept OUTSIDE any try/catch that could swallow the framework's
 * redirect (an expired session redirects to /login — vendored redirecting.mdx).
 */
async function providerContext(): Promise<ProviderAccessContext | null> {
  try {
    const { ctx } = await ProviderAccessService.resolveUserContext();
    return ctx;
  } catch (err) {
    if (isProviderAccessError(err)) return null;
    throw err;
  }
}

function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

export async function resolveCaseContextAction(input: CaseContextRequest): Promise<CaseContextResult> {
  const ctx = await providerContext();
  if (!ctx) return { outcome: "FORBIDDEN", message: "You do not have permission to do this.", correlationId: randomUUID() };
  const raw = asObject(input);
  const { result } = await ProviderCaseContextService.resolve(ctx, {
    purpose: raw.purpose as CaseContextRequest["purpose"],
    memberNumber: typeof raw.memberNumber === "string" ? raw.memberNumber : undefined,
    memberRef: typeof raw.memberRef === "string" ? raw.memberRef : undefined,
    branchId: typeof raw.branchId === "string" ? raw.branchId : null,
    serviceDate: typeof raw.serviceDate === "string" ? raw.serviceDate : "",
    benefitCategory: raw.benefitCategory as CaseContextRequest["benefitCategory"],
  });
  return result;
}

export async function searchServiceCatalogAction(input: ServiceSearchRequest): Promise<ServiceSearchResult> {
  const correlationId = randomUUID();
  const ctx = await providerContext();
  if (!ctx) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to do this.", correlationId };
  const raw = asObject(input);
  const trusted = await ProviderCaseContextService.reconstruct(ctx, asObject(raw.context) as unknown as ServiceSearchRequest["context"]);
  return ProviderServiceCatalogService.search(trusted, { category: raw.category, query: raw.query, limit: raw.limit, offset: raw.offset }, correlationId);
}

export async function searchDiagnosesAction(input: { purpose: string; query: string }): Promise<DiagnosisSearchResult> {
  const ctx = await providerContext();
  if (!ctx) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to do this.", correlationId: randomUUID() };
  const raw = asObject(input);
  return ProviderDiagnosisSearchService.search(ctx, { purpose: raw.purpose, query: raw.query });
}
