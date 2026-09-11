import "server-only";

/**
 * Family Hospital UAT plan P03.02 / FH-05 — diagnosis search for provider
 * capture.
 *
 * The claim form rendered every ICD-10 code into a native `<select>` (capped at
 * 500), which only type-ahead matches the START of an option label — so typing
 * "malaria" found nothing and staff had to know "B54". This searches code,
 * description and category by partial text, every word of the query anywhere,
 * ranked so an exact code or a leading match comes first.
 *
 * It selects ONLY code, description and category. `ICD10Code.standardCharge`
 * (a KES reference charge) is never read, so it cannot be shown or serialised.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  CAPTURE_PERMISSION,
  DIAGNOSIS_MIN_QUERY,
  type CapturePurpose,
  type DiagnosisOption,
  type DiagnosisSearchResult,
} from "@/lib/provider-capture-contract";
import type { ProviderAccessContext } from "./provider-access.service";

const RESULT_LIMIT = 20;
const CANDIDATE_LIMIT = 200;
const DIAGNOSIS_PURPOSES: readonly CapturePurpose[] = ["CLAIM", "CLAIM_CORRECTION", "PREAUTH"];

function rank(o: DiagnosisOption, q: string, first: string): number {
  const code = o.code.toUpperCase();
  const desc = o.description.toLowerCase();
  if (code === q.toUpperCase()) return 0;
  if (code.startsWith(q.toUpperCase())) return 1;
  if (desc.startsWith(q.toLowerCase())) return 2;
  if (desc.split(/[^a-z0-9]+/).some((w) => w.startsWith(first))) return 3;
  return 4;
}

export const ProviderDiagnosisSearchService = {
  async search(ctx: ProviderAccessContext, input: { purpose: unknown; query: unknown }): Promise<DiagnosisSearchResult> {
    const correlationId = ctx.requestId ?? randomUUID();
    const purpose = typeof input.purpose === "string" ? (input.purpose as CapturePurpose) : null;
    if (!purpose || !DIAGNOSIS_PURPOSES.includes(purpose) || !ctx.permissions.includes(CAPTURE_PERMISSION[purpose])) {
      return { ok: false, code: "FORBIDDEN", message: "You do not have permission to do this.", correlationId };
    }
    const query = typeof input.query === "string" ? input.query.trim().slice(0, 80) : "";
    const tokens = query.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);
    if (query.replace(/[^A-Za-z0-9]/g, "").length < DIAGNOSIS_MIN_QUERY || tokens.length === 0) {
      return { ok: false, code: "TOO_SHORT", message: `Type at least ${DIAGNOSIS_MIN_QUERY} letters or digits.`, correlationId };
    }
    if (!rateLimit(`diagnosis:${ctx.actorId}`, 120, 60_000).allowed) {
      return { ok: false, code: "THROTTLED", message: "Too many searches. Try again in a minute.", correlationId };
    }
    try {
      const rows = await prisma.iCD10Code.findMany({
        where: {
          AND: tokens.map((tok) => ({
            OR: [
              { code: { contains: tok, mode: "insensitive" as const } },
              { description: { contains: tok, mode: "insensitive" as const } },
              { category: { contains: tok, mode: "insensitive" as const } },
            ],
          })),
        },
        select: { code: true, description: true, category: true },
        orderBy: { code: "asc" },
        take: CANDIDATE_LIMIT,
      });
      const options = rows
        .map((r) => ({ code: r.code, description: r.description, category: r.category }))
        .sort((a, b) => rank(a, query, tokens[0]) - rank(b, query, tokens[0]) || a.code.localeCompare(b.code, "en"))
        .slice(0, RESULT_LIMIT);
      return { ok: true, options };
    } catch {
      return { ok: false, code: "UNAVAILABLE", message: "Diagnosis search is temporarily unavailable. Try again shortly.", correlationId };
    }
  },

  /** Submit-time check: the code must exist; the description is the catalogue's. */
  async canonical(code: unknown): Promise<{ code: string; description: string } | null> {
    if (typeof code !== "string") return null;
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9.\-]{2,16}$/.test(trimmed)) return null;
    const row = await prisma.iCD10Code.findUnique({ where: { code: trimmed }, select: { code: true, description: true } });
    return row ?? null;
  },
} as const;
