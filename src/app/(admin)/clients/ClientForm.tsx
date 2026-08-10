"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  ALLOWED_CURRENCIES,
  PAYER_TYPES,
  type ClientActionState,
} from "@/lib/validation/client";
import { createClientAction } from "./new/actions";
import { updateClientAction } from "./[id]/edit/actions";

const CLIENT_STATUSES = ["PROSPECT", "ACTIVE", "SUSPENDED", "TERMINATED"] as const;

// Focus order for the first-invalid-field focus (SP-2).
const FIELD_ORDER = ["name", "type", "currency", "memberNumberPrefix", "slug", "status", "parentClientId"];

export interface ClientFormClient {
  id: string;
  name: string;
  type: string;
  currency: string;
  status: string;
  slug: string;
  memberNumberPrefix: string;
  parentClientId: string | null;
}

export function ClientForm({
  client,
  parents,
  currencyLocked = false,
}: {
  client?: ClientFormClient;
  parents: Array<{ id: string; name: string }>;
  currencyLocked?: boolean;
}) {
  const isEdit = !!client;
  const action = isEdit ? updateClientAction.bind(null, client!.id) : createClientAction;
  const [state, formAction] = useActionState<ClientActionState | null, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  const failure = state && !state.ok ? state : null;

  // Focus the first invalid field after a failed submit (SP-2 accessibility).
  useEffect(() => {
    if (!failure?.fieldErrors) return;
    const first = FIELD_ORDER.find((f) => failure.fieldErrors?.[f]?.length);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    }
  }, [failure]);

  const err = (field: string) => failure?.fieldErrors?.[field]?.[0];
  const val = (field: string, fallback: string) => failure?.values?.[field] ?? fallback;

  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
  const roCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg-alt px-3 py-2 text-sm text-brand-text-muted";
  const labelCls = "text-sm font-medium text-brand-text-heading";
  const errCls = "mt-1 text-xs text-brand-error";

  const Err = ({ field }: { field: string }) =>
    err(field) ? (
      <p id={`${field}-error`} role="alert" className={errCls}>
        {err(field)}
      </p>
    ) : null;

  const aria = (field: string) => ({
    "aria-invalid": err(field) ? true : false,
    ...(err(field) ? { "aria-describedby": `${field}-error` } : {}),
  });

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      className="space-y-5 rounded-lg border border-brand-border bg-brand-bg p-6"
    >
      {failure?.formError && (
        <div role="alert" className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          {failure.formError}
        </div>
      )}
      {failure?.duplicate && (
        <div role="alert" className="rounded-md border border-brand-error/30 bg-brand-error/10 px-4 py-3 text-sm text-brand-error">
          A client with this name already exists:{" "}
          <Link href={`/clients/${failure.duplicate.id}`} className="font-semibold underline">
            {failure.duplicate.name}
          </Link>
          .
        </div>
      )}

      <div>
        <label className={labelCls} htmlFor="name">
          Client name <span className="text-brand-error">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={val("name", client?.name ?? "")}
          className={inputCls}
          placeholder="e.g. Jubilee Insurance Uganda"
          {...aria("name")}
        />
        <Err field="name" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="type">
            Type <span className="text-brand-error">*</span>
          </label>
          <select
            id="type"
            name="type"
            defaultValue={val("type", client?.type ?? "INSURER")}
            className={inputCls}
            {...aria("type")}
          >
            {PAYER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Err field="type" />
        </div>
        <div>
          <label className={labelCls} htmlFor="currency">
            Currency <span className="text-brand-error">*</span>
          </label>
          {isEdit && currencyLocked ? (
            <>
              {/* Disabled inputs are not submitted — carry the value in a hidden
                  field so the required-currency schema still passes (D8). */}
              <input type="hidden" name="currency" value={client!.currency} />
              <select id="currency" defaultValue={client!.currency} disabled className={`${roCls} cursor-not-allowed`}>
                {ALLOWED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-brand-text-muted">
                Locked — the client has activity, so its currency can no longer change (D8).
              </p>
            </>
          ) : (
            <>
              <select
                id="currency"
                name="currency"
                defaultValue={val("currency", client?.currency ?? "UGX")}
                className={inputCls}
                {...aria("currency")}
              >
                {ALLOWED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Err field="currency" />
            </>
          )}
        </div>
      </div>

      {/* Member-number prefix: editable on create, immutable (read-only) on edit
          (DEF-012 — a rename would orphan minted member numbers). */}
      <div>
        <label className={labelCls} htmlFor="memberNumberPrefix">
          Member-number prefix{" "}
          {isEdit ? (
            <span className="text-brand-text-muted">(immutable)</span>
          ) : (
            <span className="text-brand-text-muted">(optional)</span>
          )}
        </label>
        {isEdit ? (
          <input id="memberNumberPrefix" defaultValue={client!.memberNumberPrefix} readOnly disabled className={roCls} />
        ) : (
          <>
            <input
              id="memberNumberPrefix"
              name="memberNumberPrefix"
              maxLength={6}
              defaultValue={val("memberNumberPrefix", "")}
              className={`${inputCls} uppercase`}
              placeholder="e.g. LMU"
              {...aria("memberNumberPrefix")}
            />
            <Err field="memberNumberPrefix" />
            <p className="mt-1 text-xs text-brand-text-muted">
              3–6 chars, an uppercase letter then letters/digits. Must be unique per operator. Defaults to MVX.
            </p>
          </>
        )}
      </div>

      {/* Code / slug: editable on create, immutable (read-only) on edit. */}
      <div>
        <label className={labelCls} htmlFor="slug">
          Code / slug{" "}
          {isEdit ? (
            <span className="text-brand-text-muted">(immutable)</span>
          ) : (
            <span className="text-brand-text-muted">(optional)</span>
          )}
        </label>
        {isEdit ? (
          <input id="slug" defaultValue={client!.slug} readOnly disabled className={roCls} />
        ) : (
          <>
            <input
              id="slug"
              name="slug"
              defaultValue={val("slug", "")}
              className={inputCls}
              placeholder="auto-generated from name"
              {...aria("slug")}
            />
            <Err field="slug" />
            <p className="mt-1 text-xs text-brand-text-muted">Unique per operator. Leave blank to derive from the name.</p>
          </>
        )}
      </div>

      {isEdit && (
        <div>
          <label className={labelCls} htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={val("status", client!.status)} className={inputCls} {...aria("status")}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Err field="status" />
        </div>
      )}

      <div>
        <label className={labelCls} htmlFor="parentClientId">
          Parent client <span className="text-brand-text-muted">(optional — for subsidiaries)</span>
        </label>
        <select
          id="parentClientId"
          name="parentClientId"
          defaultValue={val("parentClientId", client?.parentClientId ?? "")}
          className={inputCls}
          {...aria("parentClientId")}
        >
          <option value="">None (top-level client)</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Err field="parentClientId" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Link
          href={isEdit ? `/clients/${client!.id}` : "/clients"}
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-brand-text-muted hover:text-brand-text-heading"
        >
          Cancel
        </Link>
        <SubmitButton>{isEdit ? "Save changes" : "Create client"}</SubmitButton>
      </div>
    </form>
  );
}
