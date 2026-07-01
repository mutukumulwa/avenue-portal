/**
 * Client-side offline rail (Medvex spec §4 / gap G4) — dependency-free.
 *
 * A durable IndexedDB buffer for the provider PWA: point-of-care operations are
 * queued locally (each with a client UUID + idempotency opKey) and flushed to
 * POST /api/v1/sync on reconnect. A separate store mirrors cached eligibility /
 * balances so verification and provisional decisions work fully offline.
 *
 * The server is the source of truth; this is the durable client buffer. Only
 * runs in the browser.
 */

const DB_NAME = "medvex-offline";
const DB_VERSION = 1;
const OUTBOX = "outbox";
const ELIGIBILITY = "eligibility";

export type SyncState = "pending" | "synced" | "conflict" | "rejected";

export interface OutboxOp {
  opKey: string; // primary key — idempotency
  clientUuid: string;
  entityType: "CheckIn" | "PreAuth" | "Claim" | "Image";
  payload: unknown;
  deviceId?: string;
  capturedAt: string; // ISO
  state: SyncState;
}

export interface CachedEligibility {
  memberId: string; // primary key
  active: boolean;
  balances: Record<string, number>;
  validUntil: string; // ISO — time-boxed
  capturedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX, { keyPath: "opKey" });
      }
      if (!db.objectStoreNames.contains(ELIGIBILITY)) {
        db.createObjectStore(ELIGIBILITY, { keyPath: "memberId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = fn(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const Outbox = {
  /** Queue an operation for store-and-forward. Returns the created op. */
  async enqueue(input: {
    entityType: OutboxOp["entityType"];
    payload: unknown;
    deviceId?: string;
    capturedAt?: string;
  }): Promise<OutboxOp> {
    const clientUuid = uuid();
    const op: OutboxOp = {
      opKey: `${input.entityType}:${clientUuid}`,
      clientUuid,
      entityType: input.entityType,
      payload: input.payload,
      deviceId: input.deviceId,
      capturedAt: input.capturedAt ?? new Date().toISOString(),
      state: "pending",
    };
    await tx(OUTBOX, "readwrite", (s) => s.put(op));
    return op;
  },

  async pending(): Promise<OutboxOp[]> {
    const all = await tx<OutboxOp[]>(OUTBOX, "readonly", (s) => s.getAll());
    return all.filter((o) => o.state === "pending");
  },

  async markState(opKey: string, state: SyncState): Promise<void> {
    const existing = await tx<OutboxOp | undefined>(OUTBOX, "readonly", (s) => s.get(opKey));
    if (!existing) return;
    await tx(OUTBOX, "readwrite", (s) => s.put({ ...existing, state }));
  },

  /**
   * Flush all pending ops to the server (idempotent by opKey). Marks each
   * accepted op `synced`. Returns the number flushed; a network error leaves
   * ops pending for the next attempt (no data loss).
   */
  async flush(apiKey?: string): Promise<{ flushed: number }> {
    const ops = await this.pending();
    if (ops.length === 0) return { flushed: 0 };

    const res = await fetch("/api/v1/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      credentials: "include",
      body: JSON.stringify({
        operations: ops.map((o) => ({
          clientUuid: o.clientUuid,
          opKey: o.opKey,
          entityType: o.entityType,
          payload: o.payload,
          deviceId: o.deviceId,
          capturedAt: o.capturedAt,
        })),
      }),
    });
    if (!res.ok) throw new Error(`sync flush failed: ${res.status}`);

    for (const o of ops) await this.markState(o.opKey, "synced");
    return { flushed: ops.length };
  },
};

/**
 * Wire automatic flushing: on reconnect (`online`), when the service worker
 * fires the "medvex-sync" background-sync tag (→ postMessage), and once now.
 * Also registers the Background Sync tag when supported. Call once from a
 * client component in the provider PWA.
 */
export function registerOfflineSync(apiKey?: string): void {
  if (typeof window === "undefined") return;
  const flush = () => Outbox.flush(apiKey).catch(() => {});

  window.addEventListener("online", flush);
  navigator.serviceWorker?.addEventListener?.("message", (e: MessageEvent) => {
    if (e.data?.type === "medvex-sync-flush") flush();
  });

  navigator.serviceWorker?.ready
    ?.then((reg) => (reg as any).sync?.register?.("medvex-sync"))
    .catch(() => {});

  if (navigator.onLine) flush();
}

export const EligibilityCache = {
  async put(entry: CachedEligibility): Promise<void> {
    await tx(ELIGIBILITY, "readwrite", (s) => s.put(entry));
  },
  /** Get cached eligibility if still within its time-boxed validity, else null. */
  async get(memberId: string): Promise<CachedEligibility | null> {
    const entry = await tx<CachedEligibility | undefined>(ELIGIBILITY, "readonly", (s) => s.get(memberId));
    if (!entry) return null;
    if (new Date(entry.validUntil).getTime() < Date.now()) return null; // stale
    return entry;
  },
};
