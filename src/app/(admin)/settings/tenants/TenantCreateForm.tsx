"use client";

import { useState } from "react";
import { createTenantAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy"; // pure module — client-safe

// Create-tenant form (docs/TENANT_ONBOARDING_PLAN.md §3). Field names must
// match what createTenantAction reads from FormData. The slug auto-suggests
// from the name until the operator edits it by hand.
// DECISION(B) plug point: branding + initial-FX-rate fields (plan doc §10).

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const inputCls =
  "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-text-body focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal";
const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

export function TenantCreateForm() {
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <form action={createTenantAction} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={labelCls} htmlFor="name">Tenant name</label>
        <input
          id="name"
          name="name"
          required
          className={inputCls}
          placeholder="Acme Health TPA"
          onChange={(e) => {
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="slug">Slug</label>
        <input
          id="slug"
          name="slug"
          required
          pattern="[a-z0-9-]+"
          className={`${inputCls} font-mono`}
          placeholder="acme-health"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
        />
        <p className="mt-1 text-xs text-brand-text-muted">Lowercase letters, digits, hyphens. Set once — no rename UI.</p>
      </div>
      <div>
        <label className={labelCls} htmlFor="currency">Currency</label>
        <select id="currency" name="currency" className={inputCls} defaultValue="UGX">
          <option value="UGX">UGX (base)</option>
          <option value="KES">KES</option>
          <option value="USD">USD</option>
        </select>
        <p className="mt-1 text-xs text-brand-text-muted">
          Non-UGX tenants must capture an FX rate before claims can be approved.
        </p>
      </div>
      <div className="hidden sm:block" />

      <div>
        <label className={labelCls} htmlFor="adminFirstName">Admin first name</label>
        <input id="adminFirstName" name="adminFirstName" required className={inputCls} placeholder="Jane" />
      </div>
      <div>
        <label className={labelCls} htmlFor="adminLastName">Admin last name</label>
        <input id="adminLastName" name="adminLastName" required className={inputCls} placeholder="Doe" />
      </div>
      <div>
        <label className={labelCls} htmlFor="adminEmail">Admin email</label>
        <input id="adminEmail" name="adminEmail" type="email" required className={inputCls} placeholder="jane@acme-health.example" />
      </div>
      <div>
        <label className={labelCls} htmlFor="adminPassword">Admin password</label>
        <input
          id="adminPassword"
          name="adminPassword"
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          className={inputCls}
        />
        <p className="mt-1 text-xs text-brand-text-muted">
          Min {PASSWORD_MIN_LENGTH} chars incl. upper, lower and a digit. Share out-of-band; it is never emailed or shown again.
        </p>
      </div>

      <div className="col-span-full flex justify-end">
        <SubmitButton className="bg-brand-indigo hover:bg-brand-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors">
          Create tenant
        </SubmitButton>
      </div>
    </form>
  );
}
