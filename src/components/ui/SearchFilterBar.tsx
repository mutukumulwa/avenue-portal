"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search, X } from "lucide-react";

export interface FilterOption {
  label: string;
  value: string;
}

interface Props {
  placeholder?: string;
  filters?: {
    key: string;
    label: string;
    options: FilterOption[];
  }[];
  /** Total count to show after filtering */
  resultCount?: number;
  totalCount?: number;
}

export function SearchFilterBar({ placeholder = "Search…", filters = [], resultCount, totalCount }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = useCallback(
    (key: string) => params.get(key) ?? "",
    [params]
  );

  const update = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // Reset to page 1 on any filter change
      next.delete("page");
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    },
    [params, pathname, router]
  );

  const hasFilters = current("q") || filters.some(f => current(f.key));

  function clear() {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }

  const inputCls = "border border-[#EEEEEE] rounded-[8px] bg-white text-sm text-avenue-text-heading placeholder-avenue-text-muted focus:outline-none focus:ring-2 focus:ring-avenue-indigo/40 focus:border-avenue-indigo transition-colors";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative flex-1 min-w-[180px]">
          <Search
            size={15}
            className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${isPending ? "text-avenue-indigo animate-pulse" : "text-avenue-text-muted"}`}
          />
          <input
            type="search"
            placeholder={placeholder}
            defaultValue={current("q")}
            onChange={e => update({ q: e.target.value })}
            className={`${inputCls} pl-9 pr-3 py-2 w-full`}
          />
        </div>

        {/* Filter selects */}
        {filters.map(f => (
          <select
            key={f.key}
            value={current(f.key)}
            onChange={e => update({ [f.key]: e.target.value })}
            className={`${inputCls} px-3 py-2 cursor-pointer`}
          >
            <option value="">{f.label}: All</option>
            {f.options.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ))}

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={clear}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-avenue-text-muted hover:text-avenue-text-heading border border-[#EEEEEE] rounded-[8px] transition-colors"
          >
            <X size={13} /> Clear
          </button>
        )}

        {/* Result count */}
        {resultCount !== undefined && (
          <span className="ml-auto text-xs text-avenue-text-muted whitespace-nowrap">
            {isPending ? "Searching…" : (
              hasFilters
                ? `${resultCount} of ${totalCount ?? resultCount} result${resultCount !== 1 ? "s" : ""}`
                : `${totalCount ?? resultCount} total`
            )}
          </span>
        )}
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-[#EEEEEE]">
          {current("q") && (
            <Chip label={`"${current("q")}"`} onRemove={() => update({ q: "" })} />
          )}
          {filters.map(f =>
            current(f.key) ? (
              <Chip
                key={f.key}
                label={`${f.label}: ${f.options.find(o => o.value === current(f.key))?.label ?? current(f.key)}`}
                onRemove={() => update({ [f.key]: "" })}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-avenue-indigo/10 text-avenue-indigo text-xs font-semibold px-2.5 py-1 rounded-full">
      {label}
      <button onClick={onRemove} className="hover:text-avenue-secondary ml-0.5">
        <X size={11} />
      </button>
    </span>
  );
}
