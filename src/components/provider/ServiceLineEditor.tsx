"use client";

/**
 * Family Hospital UAT plan P03.03 / FH-02, FH-06, FH-07 — the category-first
 * service line editor.
 *
 * What the facility found: the old line had a "Description" box that looked
 * like free text, a "CPT" box to its right that was really the search and
 * silently rewrote the description, the price AND the category the user had
 * chosen, one unfiltered list shared by every line (a Pharmacy line offered
 * Appendectomy), and prices from a Kenyan demo table labelled UGX.
 *
 * Now, in the order the plan fixes (P03.03):
 *   1. category — a real server filter;
 *   2. search the facility's OWN price list by description, inside that category;
 *   3. read-only reference data (the facility's grouping, unit, and a service
 *      code / CPT reference only if the price list carries one — never required);
 *   4. quantity;
 *   5. the billed unit price — suggested from the contract, always editable;
 *   6. the contracted rate and the case currency, shown as a separate fact;
 *   7. line total and any pre-authorisation warning.
 *
 * Rules: changing category clears a selection from another category; selecting
 * a service never changes the category; totals are decimal-safe; nothing here
 * is authority — the server re-reads every selected tariff at submit.
 */
import { useCallback, useMemo } from "react";
import Decimal from "decimal.js";
import type { ClaimLineCategory } from "@prisma/client";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import {
  CLAIM_LINE_CATEGORIES,
  CLAIM_LINE_CATEGORY_LABELS,
} from "@/lib/claim-line-category";
import {
  contextRefFrom,
  lineFieldKey,
  type CaptureLineInput,
  type CapturePurpose,
  type CaseContextDTO,
  type ServiceSearchRow,
} from "@/lib/provider-capture-contract";
import { formatGroupedAmount, parseMoney } from "@/lib/money";
import { searchServiceCatalogAction } from "@/app/provider/capture-actions";
import { MoneyInput, canonicalMoney } from "@/components/forms/MoneyInput";
import { AsyncCombobox, type SearchOutcome } from "./AsyncCombobox";
import { CAPTURE_BUTTON_SECONDARY, CAPTURE_ERROR, CAPTURE_HINT, CAPTURE_INPUT, CAPTURE_LABEL } from "./capture-styles";

export interface CaptureLineState {
  key: string;
  serviceCategory: ClaimLineCategory;
  selected: ServiceSearchRow | null;
  /** A description-first line for a service not on the price list (DEC-FH-01). */
  unlisted: boolean;
  description: string;
  quantity: string;
  billedUnitPrice: string;
  /**
   * P04.02 — a line carried from an earlier claim that is not linked to a
   * current tariff row. Kept exactly as it was until the user changes it.
   */
  historical?: boolean;
}

export function newLine(serviceCategory: ClaimLineCategory = "CONSULTATION"): CaptureLineState {
  const key = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return { key, serviceCategory, selected: null, unlisted: false, description: "", quantity: "1", billedUnitPrice: "" };
}

/** Serialise for submission: the tariff id is the only pricing input sent. */
export function toCaptureLineInputs(lines: CaptureLineState[]): CaptureLineInput[] {
  return lines.map((l) => ({
    selectedProviderTariffId: l.selected && !l.unlisted ? l.selected.tariffId : null,
    serviceCategory: l.serviceCategory,
    description: l.selected && !l.unlisted ? undefined : l.description,
    quantity: l.quantity.trim(),
    billedUnitPrice: canonicalMoney(l.billedUnitPrice) ?? l.billedUnitPrice.trim(),
  }));
}

function lineTotal(l: CaptureLineState): Decimal | null {
  const qty = /^\d{1,6}$/.test(l.quantity.trim()) ? new Decimal(l.quantity.trim()) : null;
  const price = parseMoney(l.billedUnitPrice);
  return qty && price.ok ? qty.times(price.value.toString()).toDecimalPlaces(2) : null;
}

function money(amount: string | Decimal | null, currency: string | null): string {
  if (amount === null) return "—";
  return `${currency ?? ""} ${formatGroupedAmount(amount.toString())}`.trim();
}

export function ServiceLineEditor({
  purpose,
  context,
  lines,
  onChange,
  errors,
  mode = "claim",
  disabledReason,
}: {
  purpose: CapturePurpose;
  /** A resolved, eligible case — or null (editing disabled). */
  context: CaseContextDTO | null;
  lines: CaptureLineState[];
  onChange: (lines: CaptureLineState[]) => void;
  errors: Record<string, string>;
  /** "estimate" relabels billed price as the requested estimate (pre-auth). */
  mode?: "claim" | "estimate";
  disabledReason?: string;
}) {
  const currency = context?.currency ?? null;
  const catalogue = !!context?.catalogueEnabled;
  const unlistedAllowed = !!context?.unlisted.allowed;
  const disabled = !context;

  const update = (index: number, patch: Partial<CaptureLineState>) =>
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const total = useMemo(() => {
    let sum = new Decimal(0);
    for (const l of lines) {
      const t = lineTotal(l);
      if (t) sum = sum.plus(t);
    }
    return sum;
  }, [lines]);

  const priceLabel = mode === "estimate" ? "Estimated unit cost" : "Billed unit price";

  return (
    <div className="space-y-3">
      {disabled ? (
        <p className="rounded-lg border border-dashed border-[#DDDDDD] px-4 py-3 text-sm text-brand-text-muted">
          {disabledReason ?? "Find the member first — services are priced from the contract that covers them."}
        </p>
      ) : null}
      {!disabled && !catalogue ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {unlistedAllowed
            ? "Contract rate unavailable — manual review. Price-list search is not switched on for your facility, so describe each service and enter the price you bill."
            : "Services cannot be captured for this patient at this facility. Contact Medvex."}
        </p>
      ) : null}

      <ol className="space-y-3" aria-label="Service lines">
        {lines.map((line, index) => (
          <LineRow
            key={line.key}
            index={index}
            line={line}
            purpose={purpose}
            context={context}
            currency={currency}
            catalogue={catalogue}
            unlistedAllowed={unlistedAllowed}
            disabled={disabled || (!catalogue && !unlistedAllowed)}
            errors={errors}
            priceLabel={priceLabel}
            removable={lines.length > 1}
            onUpdate={(patch) => update(index, patch)}
            onRemove={() => onChange(lines.filter((_, i) => i !== index))}
          />
        ))}
      </ol>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={disabled || lines.length >= 200}
          onClick={() => onChange([...lines, newLine("OTHER")])}
          className={CAPTURE_BUTTON_SECONDARY}
        >
          <Plus size={14} aria-hidden="true" /> Add line
        </button>
        <p className="text-sm">
          <span className="text-xs font-bold uppercase text-brand-text-muted">{mode === "estimate" ? "Estimated total" : "Total billed"} </span>
          <span className="text-lg font-bold text-brand-indigo" aria-live="polite">{money(total, currency)}</span>
        </p>
      </div>
      {errors.lines ? <p className={CAPTURE_ERROR} role="alert">{errors.lines}</p> : null}
    </div>
  );
}

function LineRow({
  index,
  line,
  purpose,
  context,
  currency,
  catalogue,
  unlistedAllowed,
  disabled,
  errors,
  priceLabel,
  removable,
  onUpdate,
  onRemove,
}: {
  index: number;
  line: CaptureLineState;
  purpose: CapturePurpose;
  context: CaseContextDTO | null;
  currency: string | null;
  catalogue: boolean;
  unlistedAllowed: boolean;
  disabled: boolean;
  errors: Record<string, string>;
  priceLabel: string;
  removable: boolean;
  onUpdate: (patch: Partial<CaptureLineState>) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const base = `line-${line.key}`;
  // Before a case is resolved the (disabled) search is shown, not a free-text
  // box: whether the price list is searchable is only known from the case.
  const describeUnlisted = line.unlisted || line.historical || (!!context && !catalogue);

  const search = useCallback(
    async (query: string): Promise<SearchOutcome<ServiceSearchRow>> => {
      if (!context) return { ok: false, message: "Find the member first." };
      const r = await searchServiceCatalogAction({ context: contextRefFrom(purpose, context), category: line.serviceCategory, query });
      if (!r.ok) return { ok: false, message: r.message };
      const note =
        r.rows.length === 0 && r.otherCategoryMatches.length > 0 ? (
          <span>
            No match under {CLAIM_LINE_CATEGORY_LABELS[line.serviceCategory]}. Found under:{" "}
            {r.otherCategoryMatches.map((m, i) => (
              <span key={m.category}>
                {i > 0 ? ", " : ""}
                <button
                  type="button"
                  className="font-semibold text-brand-indigo underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60"
                  onClick={() => onUpdate({ serviceCategory: m.category, selected: null })}
                >
                  {CLAIM_LINE_CATEGORY_LABELS[m.category]} ({m.count})
                </button>
              </span>
            ))}
          </span>
        ) : r.hasMore ? (
          <span>Showing the first {r.rows.length} of {r.total}. Type more to narrow the list.</span>
        ) : undefined;
      return { ok: true, items: r.rows, note };
    },
    [context, line.serviceCategory, onUpdate, purpose],
  );

  const total = lineTotal(line);
  const selected = line.selected && !line.unlisted ? line.selected : null;

  return (
    <li className="rounded-lg border border-[#EEEEEE] p-3" aria-label={`Line ${n}`}>
      <div className="grid gap-3 md:grid-cols-12">
        {/* 1. Category */}
        <div className="md:col-span-3">
          <label htmlFor={`${base}-cat`} className={CAPTURE_LABEL}>Line {n} category</label>
          <select
            id={`${base}-cat`}
            value={line.serviceCategory}
            disabled={disabled}
            aria-invalid={errors[lineFieldKey(index, "category")] ? true : undefined}
            onChange={(e) => {
              const next = e.target.value as ClaimLineCategory;
              // Changing category clears a selection that belongs to another one.
              onUpdate({ serviceCategory: next, selected: line.selected && line.selected.category !== next ? null : line.selected });
            }}
            className={CAPTURE_INPUT}
          >
            {CLAIM_LINE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CLAIM_LINE_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>

        {/* 2. Service — search the price list, or describe an unlisted service */}
        <div className="md:col-span-9">
          {describeUnlisted ? (
            <div>
              <label htmlFor={`${base}-desc`} className={CAPTURE_LABEL}>
                Line {n} service description<span aria-hidden="true"> *</span>
              </label>
              <input
                id={`${base}-desc`}
                value={line.description}
                disabled={disabled}
                maxLength={500}
                aria-invalid={errors[lineFieldKey(index, "description")] || errors[lineFieldKey(index, "service")] ? true : undefined}
                aria-describedby={`${base}-desc-hint`}
                onChange={(e) => onUpdate({ description: e.target.value, historical: false })}
                className={CAPTURE_INPUT}
                placeholder="Describe the service as it appears on your bill"
              />
              <p id={`${base}-desc-hint`} className={CAPTURE_HINT}>
                {line.historical
                  ? "Carried from the earlier claim and not linked to your price list. It is kept as it was unless you change it."
                  : context?.unlisted.label ?? "Not in contracted tariff — manual review."}
              </p>
              {catalogue && (line.unlisted || line.historical) ? (
                <button
                  type="button"
                  className="mt-1 text-xs font-semibold text-brand-indigo underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60"
                  onClick={() => onUpdate({ unlisted: false, historical: false, description: "", selected: null })}
                >
                  Search the price list instead
                </button>
              ) : null}
            </div>
          ) : (
            <div>
              <AsyncCombobox<ServiceSearchRow>
                // A new category is a new search: remounting drops the old text,
                // results and any reply still in flight.
                key={line.serviceCategory}
                id={`${base}-svc`}
                label={`Line ${n} service`}
                required
                disabled={disabled}
                placeholder={`Search ${CLAIM_LINE_CATEGORY_LABELS[line.serviceCategory].toLowerCase()} by name`}
                hint="Type part of the service name. Only your price list for this category is searched."
                error={errors[lineFieldKey(index, "service")]}
                search={search}
                getKey={(r) => r.tariffId}
                isItemDisabled={(r) => !r.selectable}
                itemText={(r) =>
                  r.selectable
                    ? `${r.serviceName}, ${r.taxonomyName ?? ""}, contracted rate ${money(r.unitRate, r.currency)}`
                    : `${r.serviceName}, unavailable: ${r.unavailableReason ?? ""}`
                }
                renderItem={(r) => (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-brand-text-heading">{r.serviceName}</div>
                      <div className="text-[11px] text-brand-text-muted">
                        {[r.taxonomyName, r.unitLabel].filter(Boolean).join(" · ")}
                        {r.selectable ? null : <span className="block text-[#DC3545]">{r.unavailableReason}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs font-semibold text-brand-text-body">{money(r.unitRate, r.currency)}</div>
                  </div>
                )}
                value={selected}
                renderValue={(r) => (
                  <div>
                    <div className="font-medium text-brand-text-heading">{r.serviceName}</div>
                    <div className="text-[11px] text-brand-text-muted">
                      {[r.taxonomyName, r.unitLabel].filter(Boolean).join(" · ")}
                      {r.providerServiceCode ? ` · Service code ${r.providerServiceCode}` : ""}
                      {r.cptCode ? ` · CPT reference ${r.cptCode}` : ""}
                    </div>
                  </div>
                )}
                onSelect={(r) =>
                  // Selecting never changes the category (results are already in it).
                  // Suggest the contracted rate as the billed price only if none was typed.
                  onUpdate({ selected: r, historical: false, billedUnitPrice: line.billedUnitPrice.trim() ? line.billedUnitPrice : formatGroupedAmount(r.unitRate) })
                }
                onClear={() => onUpdate({ selected: null })}
                clearLabel={`Clear line ${n} service`}
              />
              {unlistedAllowed ? (
                <button
                  type="button"
                  disabled={disabled}
                  className="mt-1 text-xs font-semibold text-brand-indigo underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60"
                  onClick={() => onUpdate({ unlisted: true, selected: null })}
                >
                  Service not on the price list
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* 4. Quantity */}
        <div className="md:col-span-2">
          <label htmlFor={`${base}-qty`} className={CAPTURE_LABEL}>Qty</label>
          <input
            id={`${base}-qty`}
            inputMode="numeric"
            value={line.quantity}
            disabled={disabled}
            aria-invalid={errors[lineFieldKey(index, "quantity")] ? true : undefined}
            aria-describedby={errors[lineFieldKey(index, "quantity")] ? `${base}-qty-err` : undefined}
            onChange={(e) => onUpdate({ quantity: e.target.value.replace(/[^\d]/g, "").slice(0, 6) })}
            className={CAPTURE_INPUT}
          />
          {errors[lineFieldKey(index, "quantity")] ? (
            <p id={`${base}-qty-err`} className={CAPTURE_ERROR} role="alert">{errors[lineFieldKey(index, "quantity")]}</p>
          ) : null}
        </div>

        {/* 5. Billed (or estimated) unit price — always editable */}
        <div className="md:col-span-4">
          <MoneyInput
            id={`${base}-price`}
            label={priceLabel}
            value={line.billedUnitPrice}
            currency={currency}
            required
            disabled={disabled}
            error={errors[lineFieldKey(index, "billedUnitPrice")]}
            hint={selected ? "Suggested from your contract; change it if you bill a different amount." : undefined}
            onChange={(v) => onUpdate({ billedUnitPrice: v })}
          />
        </div>

        {/* 6. Contracted rate — a separate fact, never the billed price */}
        <div className="md:col-span-3">
          <span className={CAPTURE_LABEL}>Contracted rate</span>
          <p className="py-2 text-sm font-semibold text-brand-text-heading">
            {selected ? money(selected.unitRate, selected.currency) : <span className="font-normal text-brand-text-muted">Not in contracted tariff — manual review</span>}
          </p>
        </div>

        {/* 7. Line total and warnings */}
        <div className="flex items-end justify-between gap-2 md:col-span-3">
          <div>
            <span className={CAPTURE_LABEL}>Line total</span>
            <p className="py-2 text-sm font-bold text-brand-indigo">{money(total, currency)}</p>
          </div>
          {removable ? (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove line ${n}`}
              className="mb-1 rounded p-2 text-brand-text-muted hover:text-[#DC3545] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60"
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
      {selected?.requiresPreauth ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-[#856404]">
          <AlertTriangle size={13} aria-hidden="true" /> This service needs pre-authorisation under your contract.
        </p>
      ) : null}
      {errors[lineFieldKey(index, "service")] && describeUnlisted ? (
        <p className={CAPTURE_ERROR} role="alert">{errors[lineFieldKey(index, "service")]}</p>
      ) : null}
      {errors[lineFieldKey(index, "description")] ? (
        <p className={CAPTURE_ERROR} role="alert">{errors[lineFieldKey(index, "description")]}</p>
      ) : null}
    </li>
  );
}
