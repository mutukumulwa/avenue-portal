/**
 * UAT-HF P04.02 — bounded draft persistence for online-only forms.
 *
 * DEF-071: "Client storage sampled while the enrolment form held nine fields of
 * typed data showed localStorage, sessionStorage and IndexedDB all empty —
 * nothing is persisted as the operator works." Closing the tab and reopening
 * produced a blank form with no restore banner and no statement that anything
 * had been lost.
 * DEF-008 / DEF-016: the same forms discard typed input on every exit path with
 * no warning.
 *
 * ## Why sessionStorage, and not localStorage
 *
 * The plan offers a choice: "encrypt sensitive drafts or keep session-memory
 * only". This takes the second option.
 *
 * These forms hold national ID, date of birth, phone and email — PII for a real
 * person, typed at a shared provider or membership desk. `localStorage` survives
 * the browser being closed and the operator walking away, so a draft written
 * there outlives the shift that created it. `sessionStorage` is scoped to the
 * tab: it survives the reload and the in-tab navigation the acceptance names,
 * and dies when the tab does. Encrypting instead would mean holding a key in the
 * same browser as the ciphertext, which is a longer way of arriving nowhere.
 *
 * The trade is deliberate and bounded: **a closed tab loses the draft.** What it
 * must never do is lose it *silently*, which is the actual defect.
 *
 * ## What is stored
 *
 * Only fields a form has explicitly listed. The allowlist is per form and lives
 * beside it, so adding a field to a form does not silently start persisting it.
 * Anything not listed is dropped — including any field a future edit adds.
 */

const PREFIX = "medvex.draft.v1";

/** 12 hours: longer than any shift, shorter than a stale draft is useful. */
export const DEFAULT_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

export interface DraftScope {
  tenantId: string;
  userId: string;
}

export interface DraftSpec {
  /** Stable id for the form, e.g. "members.create". */
  formId: string;
  /**
   * The ONLY fields that may be persisted. Anything else is dropped, so a field
   * added to the form later is not persisted until it is added here too.
   */
  fields: readonly string[];
  ttlMs?: number;
}

export interface StoredDraft {
  formId: string;
  tenantId: string;
  userId: string;
  /** ISO instant the draft was last written. */
  savedAt: string;
  values: Record<string, string>;
}

function keyFor(scope: DraftScope, spec: DraftSpec): string {
  return `${PREFIX}:${scope.tenantId}:${scope.userId}:${spec.formId}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    // Storage can throw outright when disabled by policy or in private mode.
    return null;
  }
}

/** Keep only allowlisted, non-empty string fields. */
function approvedValues(spec: DraftSpec, values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of spec.fields) {
    const raw = values[field];
    if (typeof raw !== "string") continue;
    if (raw.trim() === "") continue;
    out[field] = raw;
  }
  return out;
}

function clearDraft(scope: DraftScope, spec: DraftSpec): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(keyFor(scope, spec));
  } catch {
    // Nothing useful to do; the draft expires on its own.
  }
}

export const DraftStore = {
  /**
   * Persist the approved subset. Returns the draft as stored, or null when
   * there was nothing worth storing or no storage to store it in.
   */
  save(
    scope: DraftScope,
    spec: DraftSpec,
    values: Record<string, unknown>,
    now: Date = new Date(),
  ): StoredDraft | null {
    const store = storage();
    if (!store) return null;
    if (!scope.tenantId || !scope.userId) return null;

    const approved = approvedValues(spec, values);
    if (Object.keys(approved).length === 0) {
      // An empty form is not a draft. Clear any previous one rather than
      // leaving a stale draft that no longer reflects the screen.
      clearDraft(scope, spec);
      return null;
    }

    const draft: StoredDraft = {
      formId: spec.formId,
      tenantId: scope.tenantId,
      userId: scope.userId,
      savedAt: now.toISOString(),
      values: approved,
    };
    try {
      store.setItem(keyFor(scope, spec), JSON.stringify(draft));
    } catch {
      // Quota or policy. A draft we cannot save must not break the form the
      // operator is typing into.
      return null;
    }
    return draft;
  },

  /**
   * Read a draft back, or null when there is none, it has expired, or it does
   * not belong to this tenant and user.
   */
  load(scope: DraftScope, spec: DraftSpec, now: Date = new Date()): StoredDraft | null {
    const store = storage();
    if (!store || !scope.tenantId || !scope.userId) return null;

    let parsed: unknown;
    try {
      const raw = store.getItem(keyFor(scope, spec));
      if (!raw) return null;
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (typeof parsed !== "object" || parsed === null) return null;
    const draft = parsed as Partial<StoredDraft>;

    // Defence in depth: the key already scopes by tenant and user, but a draft
    // that disagrees with its own key is not one we will hand to anybody.
    // The acceptance is explicit that another user on the same browser must not
    // see these fields.
    if (draft.tenantId !== scope.tenantId || draft.userId !== scope.userId || draft.formId !== spec.formId) {
      clearDraft(scope, spec);
      return null;
    }

    if (typeof draft.savedAt !== "string" || typeof draft.values !== "object" || draft.values === null) {
      clearDraft(scope, spec);
      return null;
    }

    const savedAt = new Date(draft.savedAt);
    if (Number.isNaN(savedAt.getTime())) {
      clearDraft(scope, spec);
      return null;
    }

    const ttl = spec.ttlMs ?? DEFAULT_DRAFT_TTL_MS;
    if (now.getTime() - savedAt.getTime() > ttl) {
      clearDraft(scope, spec);
      return null;
    }

    // Re-filter on read: if the allowlist has since narrowed, a field it no
    // longer approves must not come back out of storage.
    const values = approvedValues(spec, draft.values as Record<string, unknown>);
    if (Object.keys(values).length === 0) {
      clearDraft(scope, spec);
      return null;
    }

    return {
      formId: spec.formId,
      tenantId: scope.tenantId,
      userId: scope.userId,
      savedAt: draft.savedAt,
      values,
    };
  },

  /** Drop one form's draft — on successful submit, or on explicit discard. */
  clear: clearDraft,

  /**
   * Drop every draft this module owns, whoever they belong to.
   *
   * Called on sign-out: the acceptance requires that logout purges drafts, and
   * at that point we may no longer know which scope they were written under.
   */
  purgeAll(): void {
    const store = storage();
    if (!store) return;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key?.startsWith(`${PREFIX}:`)) doomed.push(key);
      }
      for (const key of doomed) store.removeItem(key);
    } catch {
      // As above.
    }
  },
};

/**
 * The member enrolment allowlist.
 *
 * Every field the form collects is listed: none of them is a secret, and having
 * to retype a national ID is exactly the loss DEF-071 recorded. The bound on PII
 * here is the storage medium — tab-scoped, 12h — not a shorter field list.
 */
export const MEMBER_ENROLMENT_DRAFT: DraftSpec = {
  formId: "members.create",
  fields: [
    "groupId",
    "relationship",
    "effectiveDate",
    "firstName",
    "lastName",
    "dateOfBirth",
    "gender",
    "idNumber",
    "birthNotificationDate",
    "phone",
    "email",
  ],
};
