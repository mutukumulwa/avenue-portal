"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, X } from "lucide-react";

export interface SearchSelectOption {
  id: string;
  label: string;
  sublabel?: string;
  meta?: string;
}

interface Props {
  options: SearchSelectOption[];
  value: string;                      // selected id
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchSelect({ options, value, onChange, placeholder = "Search…", className = "" }: Props) {
  const [query, setQuery]   = useState("");
  const [open, setOpen]     = useState(false);
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.id === value);

  const filtered = query.length === 0
    ? options
    : options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sublabel?.toLowerCase().includes(query.toLowerCase()) ||
        o.meta?.toLowerCase().includes(query.toLowerCase())
      );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(opt: SearchSelectOption) {
    onChange(opt.id);
    setOpen(false);
    setQuery("");
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setQuery("");
  }

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:border-avenue-indigo transition-colors bg-white hover:border-avenue-indigo/50"
      >
        <span className={selected ? "text-avenue-text-heading" : "text-avenue-text-muted"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <span onClick={clear} className="p-0.5 rounded hover:bg-[#F8F9FA] text-avenue-text-muted hover:text-[#DC3545] transition-colors">
              <X size={12} />
            </span>
          )}
          <ChevronDown size={13} className="text-avenue-text-muted" />
        </span>
      </button>

      {/* Selected sublabel */}
      {selected?.sublabel && !open && (
        <p className="text-[10px] text-avenue-text-muted mt-0.5 pl-1">{selected.sublabel}</p>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#EEEEEE] rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-[#EEEEEE]">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-avenue-text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type to filter…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-[#EEEEEE] rounded-md focus:outline-none focus:border-avenue-indigo"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-[#F8F9FA]">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-avenue-text-muted text-center">No matches</p>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onMouseDown={() => pick(opt)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-avenue-indigo/5 transition-colors ${opt.id === value ? "bg-avenue-indigo/5" : ""}`}
                >
                  <p className="text-sm font-semibold text-avenue-text-heading">{opt.label}</p>
                  {opt.sublabel && <p className="text-xs text-avenue-text-muted mt-0.5">{opt.sublabel}</p>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
