"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";

interface MemberOption {
  id: string;
  name: string;
  memberNumber: string;
  groupName: string;
}

/**
 * E2E-OBS-MEMSEL: async, tenant/client-scoped member picker for the Invite-User
 * "Member User" branch. Queries /api/admin/members/search so the whole roster is
 * reachable (the old preloaded <select> capped at ~250). Emits a hidden input
 * named `memberId` so the surrounding form action is unchanged.
 */
export function MemberSearchPicker({ name = "memberId" }: { name?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberOption[]>([]);
  const [selected, setSelected] = useState<MemberOption | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/members/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults(data.members ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced fetch as the admin types; also seeds an initial page on open.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, runSearch]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(m: MemberOption) {
    setSelected(m);
    setOpen(false);
    setQuery("");
  }

  function clear() {
    setSelected(null);
    setResults([]);
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* The value the form action reads. */}
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      {selected ? (
        <div className="w-full flex items-center justify-between border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm bg-white">
          <span className="text-brand-text-heading">
            {selected.name} · {selected.memberNumber} · {selected.groupName}
          </span>
          <button type="button" onClick={clear} className="p-0.5 rounded hover:bg-[#F8F9FA] text-brand-text-muted hover:text-[#DC3545] transition-colors">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-text-muted" />
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            placeholder="Search by name, member number or scheme…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-[#EEEEEE] rounded-lg focus:outline-none focus:border-brand-indigo bg-white"
          />
        </div>
      )}

      {open && !selected && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#EEEEEE] rounded-lg shadow-lg overflow-hidden">
          <div className="max-h-56 overflow-y-auto divide-y divide-[#F8F9FA]">
            {loading ? (
              <p className="px-3 py-4 text-sm text-brand-text-muted text-center">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-sm text-brand-text-muted text-center">
                {query ? "No matching unlinked members" : "Type to search members"}
              </p>
            ) : (
              results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={() => pick(m)}
                  className="w-full text-left px-3 py-2.5 hover:bg-brand-indigo/5 transition-colors"
                >
                  <p className="text-sm font-semibold text-brand-text-heading">{m.name}</p>
                  <p className="text-xs text-brand-text-muted mt-0.5">{m.memberNumber} · {m.groupName}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
