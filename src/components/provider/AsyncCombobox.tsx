"use client";

/**
 * Family Hospital UAT plan P03.02 / P03.03 — ONE accessible, server-backed
 * search-and-select control, used for diagnoses and for the facility's
 * services. Built once so both behave identically (P03: "Do not duplicate new
 * controls in each form").
 *
 * Pattern: WAI-ARIA 1.2 combobox with a listbox popup —
 *   - the input has role="combobox", aria-expanded, aria-controls,
 *     aria-autocomplete="list" and aria-activedescendant;
 *   - options have role="option", aria-selected, aria-disabled;
 *   - ArrowDown/ArrowUp/Home/End move, Enter selects, Escape closes (and, when
 *     already closed, clears the text), Tab leaves;
 *   - outside clicks close; a selection shows as a value with a Clear button
 *     that returns focus to the search box.
 *
 * A new search context (e.g. another category) is a new control: the caller
 * gives it a different React `key`, which discards the typed text, the results
 * and any in-flight reply along with the old instance.
 *
 * Network behaviour: a search starts only after `minChars` meaningful
 * characters and a short pause (debounce), and a response that arrives after a
 * newer request is IGNORED (request sequence number) — so a slow reply can never
 * overwrite what the user is now looking at. Result counts, "no matches" and
 * errors are announced through a polite live region.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2, Search, X } from "lucide-react";
import { CAPTURE_ERROR, CAPTURE_HINT, CAPTURE_INPUT, CAPTURE_LABEL, LISTBOX } from "./capture-styles";

export type SearchOutcome<T> =
  | { ok: true; items: T[]; note?: ReactNode }
  | { ok: false; message: string };

export interface AsyncComboboxProps<T> {
  id?: string;
  label: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  minChars?: number;
  debounceMs?: number;
  search: (query: string) => Promise<SearchOutcome<T>>;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  isItemDisabled?: (item: T) => boolean;
  /** Accessible text for an option (what a screen reader reads). */
  itemText: (item: T) => string;
  value: T | null;
  renderValue: (item: T) => ReactNode;
  onSelect: (item: T) => void;
  onClear: () => void;
  clearLabel: string;
}

const meaningfulLength = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").length;

export function AsyncCombobox<T>(props: AsyncComboboxProps<T>) {
  const {
    label, placeholder, hint, error, required, disabled, disabledReason, minChars = 2, debounceMs = 250,
    search, getKey, renderItem, isItemDisabled, itemText, value, renderValue, onSelect, onClear, clearLabel,
  } = props;
  const autoId = useId();
  const id = props.id ?? `combo-${autoId}`;
  const listId = `${id}-listbox`;
  const statusId = `${id}-status`;
  const hintId = `${id}-hint`;

  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [note, setNote] = useState<ReactNode>(null);
  const [active, setActive] = useState(-1);
  const [phase, setPhase] = useState<"idle" | "short" | "loading" | "done" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    seq.current += 1; // any in-flight response is now stale
    if (timer.current) clearTimeout(timer.current);
    setItems([]);
    setNote(null);
    setActive(-1);
    setPhase("idle");
    setProblem(null);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const runSearch = useCallback(
    (query: string) => {
      if (timer.current) clearTimeout(timer.current);
      const mine = ++seq.current;
      if (meaningfulLength(query) < minChars) {
        setItems([]);
        setNote(null);
        setActive(-1);
        setPhase(query.trim() ? "short" : "idle");
        return;
      }
      setPhase("loading");
      timer.current = setTimeout(async () => {
        try {
          const outcome = await search(query);
          if (mine !== seq.current) return; // stale: a newer search superseded this one
          if (outcome.ok) {
            setItems(outcome.items);
            setNote(outcome.note ?? null);
            setActive(outcome.items.findIndex((it) => !isItemDisabled?.(it)));
            setProblem(null);
            setPhase("done");
          } else {
            setItems([]);
            setNote(null);
            setActive(-1);
            setProblem(outcome.message);
            setPhase("error");
          }
        } catch {
          if (mine !== seq.current) return;
          setItems([]);
          setActive(-1);
          setProblem("Search is temporarily unavailable. Try again.");
          setPhase("error");
        }
      }, debounceMs);
    },
    [debounceMs, isItemDisabled, minChars, search],
  );

  const choose = (item: T) => {
    if (isItemDisabled?.(item)) return;
    onSelect(item);
    setText("");
    setOpen(false);
    reset();
  };

  const move = (delta: 1 | -1 | "first" | "last") => {
    const enabled = items.map((it, i) => (isItemDisabled?.(it) ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    if (delta === "first") return setActive(enabled[0]);
    if (delta === "last") return setActive(enabled[enabled.length - 1]);
    const pos = enabled.indexOf(active);
    const next = pos === -1 ? (delta === 1 ? 0 : enabled.length - 1) : Math.min(Math.max(pos + delta, 0), enabled.length - 1);
    setActive(enabled[next]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        if (open) { e.preventDefault(); move("first"); }
        break;
      case "End":
        if (open) { e.preventDefault(); move("last"); }
        break;
      case "Enter":
        // Never submit the surrounding form from inside a search box.
        e.preventDefault();
        if (open && active >= 0 && items[active]) choose(items[active]);
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        } else if (text) {
          e.preventDefault();
          setText("");
          reset();
        }
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const status =
    phase === "loading"
      ? "Searching…"
      : phase === "short"
        ? `Type at least ${minChars} letters or digits.`
        : phase === "error"
          ? problem
          : phase === "done"
            ? items.length === 0
              ? "No matches."
              : `${items.length} result${items.length === 1 ? "" : "s"}. Use the arrow keys to choose.`
            : "";

  if (value) {
    return (
      <div>
        <span className={CAPTURE_LABEL} id={`${id}-label`}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </span>
        <div
          className="flex items-start justify-between gap-2 rounded-lg border border-[#DDDDDD] bg-brand-bg-alt/40 px-3 py-2 text-sm"
          role="group"
          aria-labelledby={`${id}-label`}
        >
          <div className="min-w-0">{renderValue(value)}</div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onClear();
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label={clearLabel}
            className="shrink-0 rounded p-1 text-brand-text-muted hover:text-[#DC3545] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {error ? <p className={CAPTURE_ERROR} role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label htmlFor={id} className={CAPTURE_LABEL}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-describedby={[hintId, statusId].join(" ")}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            runSearch(e.target.value);
          }}
          onFocus={() => {
            if (items.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={`${CAPTURE_INPUT} pl-8`}
        />
        {phase === "loading" ? (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-brand-text-muted" aria-hidden="true" />
        ) : null}
      </div>
      <ul id={listId} role="listbox" aria-label={label} className={open && items.length > 0 ? LISTBOX : "hidden"}>
        {items.map((item, i) => {
          const itemDisabled = isItemDisabled?.(item) ?? false;
          return (
            <li
              key={getKey(item)}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={itemDisabled || undefined}
              aria-label={itemText(item)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item)}
              onMouseEnter={() => !itemDisabled && setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-brand-indigo/10" : ""} ${itemDisabled ? "cursor-not-allowed opacity-60" : "hover:bg-brand-bg-alt"}`}
            >
              {renderItem(item)}
            </li>
          );
        })}
      </ul>
      {/* A hint such as "found under another category" may carry a button, so it
          lives outside the listbox (a listbox may contain options only). */}
      {note && phase === "done" ? <div className="mt-1 text-xs text-brand-text-muted">{note}</div> : null}
      <p id={hintId} className={CAPTURE_HINT}>
        {disabled && disabledReason ? disabledReason : hint}
      </p>
      <p id={statusId} role="status" aria-live="polite" className={phase === "error" ? CAPTURE_ERROR : "sr-only"}>
        {status}
      </p>
      {error ? <p className={CAPTURE_ERROR} role="alert">{error}</p> : null}
    </div>
  );
}
