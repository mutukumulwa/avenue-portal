import Link from "next/link";

/**
 * Server-rendered pagination controls. Preserves existing filter params and only
 * swaps `page`, so the browser fetches one page of rows at a time (bandwidth-friendly
 * on slow connections). Renders nothing for single-page result sets.
 */
export function Pagination({
  page,
  totalPages,
  total,
  params,
  basePath,
  unit = "items",
}: {
  page: number;
  totalPages: number;
  total: number;
  params: Record<string, string | undefined>;
  basePath: string;
  unit?: string;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const linkCls =
    "rounded-full border border-[#D6DCE5] px-4 py-1.5 font-semibold text-brand-text-body hover:border-brand-secondary transition-colors";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm text-brand-text-muted">
      <span>
        Page {page} of {totalPages} · {total.toLocaleString()} {unit}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={linkCls}>← Prev</Link>
        ) : (
          <span className={`${linkCls} cursor-not-allowed opacity-40`}>← Prev</span>
        )}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={linkCls}>Next →</Link>
        ) : (
          <span className={`${linkCls} cursor-not-allowed opacity-40`}>Next →</span>
        )}
      </div>
    </div>
  );
}
