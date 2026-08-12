/**
 * UAT-HF P04.02 acceptance — "offline/refresh preserves the approved fields;
 * another user on the same browser cannot see them; success and logout purge
 * them."
 *
 * DEF-071: "Client storage sampled while the enrolment form held nine fields of
 * typed data showed localStorage, sessionStorage and IndexedDB all empty."
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_DRAFT_TTL_MS,
  DraftStore,
  MEMBER_ENROLMENT_DRAFT,
  type DraftScope,
} from "@/lib/draft-store";

const ALICE: DraftScope = { tenantId: "t1", userId: "alice" };
const BOB: DraftScope = { tenantId: "t1", userId: "bob" };
const OTHER_TENANT: DraftScope = { tenantId: "t2", userId: "alice" };

const SPEC = MEMBER_ENROLMENT_DRAFT;
const T0 = new Date("2026-08-12T09:00:00Z");

const TYPED = {
  firstName: "Amina",
  lastName: "Nabirye Kato",
  idNumber: "CM12345678",
  dateOfBirth: "1990-01-01",
  gender: "FEMALE",
};

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe("P04.02 a draft survives the interruption", () => {
  it("stores and reads back the approved fields", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    const back = DraftStore.load(ALICE, SPEC, T0);
    expect(back?.values).toEqual(TYPED);
    expect(back?.savedAt).toBe(T0.toISOString());
  });

  it("actually writes to sessionStorage — the store the run found empty", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    const keys = Object.keys(sessionStorage);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain("medvex.draft.v1");
  });

  it("never touches localStorage, where PII would outlive the shift", () => {
    // Asserted against the source rather than the environment: jsdom exposes no
    // localStorage here, so an empty-localStorage check would pass vacuously.
    // The choice of medium is the whole PII bound, so it is worth pinning.
    const source = readFileSync("src/lib/draft-store.ts", "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    expect(source).not.toContain("localStorage");
    expect(source).toContain("sessionStorage");
  });

  it("overwrites rather than accumulating as the operator keeps typing", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    const later = new Date(T0.getTime() + 5_000);
    DraftStore.save(ALICE, SPEC, { ...TYPED, firstName: "Aminah" }, later);
    expect(Object.keys(sessionStorage)).toHaveLength(1);
    const back = DraftStore.load(ALICE, SPEC, later);
    expect(back?.values.firstName).toBe("Aminah");
    expect(back?.savedAt).toBe(later.toISOString());
  });
});

describe("P04.02 only approved fields are ever persisted", () => {
  it("drops a field the form did not declare", () => {
    DraftStore.save(ALICE, SPEC, { ...TYPED, password: "hunter2", csrf: "abc" }, T0);
    const back = DraftStore.load(ALICE, SPEC, T0);
    expect(back?.values).not.toHaveProperty("password");
    expect(back?.values).not.toHaveProperty("csrf");
    expect(JSON.stringify(sessionStorage)).not.toContain("hunter2");
  });

  it("re-filters on READ, so narrowing the allowlist retires old fields", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    const narrowed = { ...SPEC, fields: ["firstName"] as const };
    const back = DraftStore.load(ALICE, narrowed, T0);
    expect(back?.values).toEqual({ firstName: "Amina" });
  });

  it("ignores blank and non-string values", () => {
    DraftStore.save(ALICE, SPEC, { firstName: "Amina", lastName: "   ", gender: 42 }, T0);
    expect(DraftStore.load(ALICE, SPEC, T0)?.values).toEqual({ firstName: "Amina" });
  });

  it("an entirely empty form is not a draft, and clears any previous one", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    expect(DraftStore.save(ALICE, SPEC, { firstName: "" }, T0)).toBeNull();
    // The operator cleared the form; offering the old draft back would be wrong.
    expect(DraftStore.load(ALICE, SPEC, T0)).toBeNull();
  });
});

describe("P04.02 another user on the same browser cannot see them", () => {
  it("a second operator gets nothing", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    expect(DraftStore.load(BOB, SPEC, T0)).toBeNull();
  });

  it("a different tenant gets nothing", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    expect(DraftStore.load(OTHER_TENANT, SPEC, T0)).toBeNull();
  });

  it("two operators' drafts coexist without leaking into each other", () => {
    DraftStore.save(ALICE, SPEC, { firstName: "Amina" }, T0);
    DraftStore.save(BOB, SPEC, { firstName: "Brian" }, T0);
    expect(DraftStore.load(ALICE, SPEC, T0)?.values.firstName).toBe("Amina");
    expect(DraftStore.load(BOB, SPEC, T0)?.values.firstName).toBe("Brian");
  });

  it("a draft whose contents disagree with its key is refused and deleted", () => {
    // Defence in depth: someone editing storage by hand, or a key scheme change,
    // must not be able to hand Alice's typed PII to Bob.
    const key = `medvex.draft.v1:t1:bob:${SPEC.formId}`;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        formId: SPEC.formId,
        tenantId: "t1",
        userId: "alice",
        savedAt: T0.toISOString(),
        values: TYPED,
      }),
    );
    expect(DraftStore.load(BOB, SPEC, T0)).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("refuses a draft written for a different form", () => {
    const key = `medvex.draft.v1:t1:alice:${SPEC.formId}`;
    sessionStorage.setItem(
      key,
      JSON.stringify({
        formId: "clients.create",
        tenantId: "t1",
        userId: "alice",
        savedAt: T0.toISOString(),
        values: TYPED,
      }),
    );
    expect(DraftStore.load(ALICE, SPEC, T0)).toBeNull();
  });

  it("stores nothing at all without a tenant and user to scope it to", () => {
    expect(DraftStore.save({ tenantId: "", userId: "" }, SPEC, TYPED, T0)).toBeNull();
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });
});

describe("P04.02 drafts expire and are purged", () => {
  it("is gone once past the TTL, and removed from storage", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    const late = new Date(T0.getTime() + DEFAULT_DRAFT_TTL_MS + 1);
    expect(DraftStore.load(ALICE, SPEC, late)).toBeNull();
    expect(Object.keys(sessionStorage)).toHaveLength(0);
  });

  it("survives right up to the TTL boundary", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    const edge = new Date(T0.getTime() + DEFAULT_DRAFT_TTL_MS);
    expect(DraftStore.load(ALICE, SPEC, edge)).not.toBeNull();
  });

  it("clear() removes one form's draft and leaves the others", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    DraftStore.save(BOB, SPEC, { firstName: "Brian" }, T0);
    DraftStore.clear(ALICE, SPEC);
    expect(DraftStore.load(ALICE, SPEC, T0)).toBeNull();
    expect(DraftStore.load(BOB, SPEC, T0)).not.toBeNull();
  });

  it("purgeAll() removes every draft — this is what logout must do", () => {
    DraftStore.save(ALICE, SPEC, TYPED, T0);
    DraftStore.save(BOB, SPEC, { firstName: "Brian" }, T0);
    sessionStorage.setItem("unrelated.key", "keep me");

    DraftStore.purgeAll();

    expect(DraftStore.load(ALICE, SPEC, T0)).toBeNull();
    expect(DraftStore.load(BOB, SPEC, T0)).toBeNull();
    // ...and nothing that is not ours.
    expect(sessionStorage.getItem("unrelated.key")).toBe("keep me");
  });
});

describe("P04.02 a broken or hostile store never breaks the form", () => {
  it("unparseable JSON reads as no draft", () => {
    sessionStorage.setItem(`medvex.draft.v1:t1:alice:${SPEC.formId}`, "{not json");
    expect(DraftStore.load(ALICE, SPEC, T0)).toBeNull();
  });

  it("a draft with a nonsense timestamp is dropped", () => {
    sessionStorage.setItem(
      `medvex.draft.v1:t1:alice:${SPEC.formId}`,
      JSON.stringify({ ...ALICE, formId: SPEC.formId, savedAt: "never", values: TYPED }),
    );
    expect(DraftStore.load(ALICE, SPEC, T0)).toBeNull();
  });

  /**
   * jsdom wraps sessionStorage in a Proxy so `storage.foo = 1` behaves like
   * setItem — which means `vi.spyOn(sessionStorage, "setItem")` does not stub
   * the method, it stores an item CALLED "setItem". Replace the whole object.
   */
  function withStorage(fake: Partial<Storage>, run: () => void) {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      value: { length: 0, key: () => null, clear: () => {}, removeItem: () => {}, ...fake },
      configurable: true,
      writable: true,
    });
    try {
      run();
    } finally {
      if (original) Object.defineProperty(window, "sessionStorage", original);
      else delete (window as unknown as Record<string, unknown>).sessionStorage;
    }
  }

  it("a storage that throws on write is survivable", () => {
    withStorage(
      {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        getItem: () => null,
      },
      () => {
        // The operator is mid-enrolment; a full disk must not take the form down.
        expect(() => DraftStore.save(ALICE, SPEC, TYPED, T0)).not.toThrow();
        expect(DraftStore.save(ALICE, SPEC, TYPED, T0)).toBeNull();
      },
    );
  });

  it("a storage that throws on read is survivable", () => {
    withStorage(
      {
        getItem: () => {
          throw new Error("SecurityError");
        },
      },
      () => {
        expect(() => DraftStore.load(ALICE, SPEC, T0)).not.toThrow();
        expect(DraftStore.load(ALICE, SPEC, T0)).toBeNull();
      },
    );
  });

  it("no storage at all reads and writes as null, not a crash", () => {
    withStorage({}, () => {
      // Private mode / policy-disabled storage.
      Object.defineProperty(window, "sessionStorage", { value: undefined, configurable: true });
      expect(DraftStore.save(ALICE, SPEC, TYPED, T0)).toBeNull();
      expect(DraftStore.load(ALICE, SPEC, T0)).toBeNull();
      expect(() => DraftStore.purgeAll()).not.toThrow();
    });
  });
});

describe("P04.02 the enrolment allowlist", () => {
  it("covers every field the run watched an operator type", () => {
    // DEF-071 recorded "nine fields of typed data". All of them must come back.
    for (const field of [
      "firstName",
      "lastName",
      "dateOfBirth",
      "gender",
      "idNumber",
      "phone",
      "email",
      "groupId",
      "relationship",
      "effectiveDate",
      "birthNotificationDate",
    ]) {
      expect(MEMBER_ENROLMENT_DRAFT.fields, field).toContain(field);
    }
  });

  it("does not carry the operation id, which must be minted fresh per attempt", () => {
    // Restoring an old idempotency key would make the new enrolment a replay of
    // the old one (P01.02) and silently write nothing.
    expect(MEMBER_ENROLMENT_DRAFT.fields).not.toContain("__operationId");
  });
});

describe("P04.02 logout purges drafts", () => {
  it("the sign-in page mounts the purge, so every sign-out path is covered", () => {
    // There are six client sign-out handlers plus /signout plus the session-
    // expiry redirect. All of them land on /login, so the purge lives there
    // rather than in eight places that can each be forgotten.
    const login = readFileSync("src/app/(auth)/login/page.tsx", "utf8");
    expect(login).toContain("DraftPurgeOnSignOut");
    const purge = readFileSync("src/components/forms/DraftPurgeOnSignOut.tsx", "utf8");
    expect(purge).toContain("DraftStore.purgeAll()");
  });
});
