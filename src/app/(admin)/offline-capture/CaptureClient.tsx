"use client";

import { useEffect, useState, useTransition } from "react";
import { WifiOff, Wifi, UploadCloud, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Outbox, registerOfflineSync, type OutboxOp } from "@/lib/offline/outbox";
import { decryptPackInBrowser } from "@/lib/offline/pack-crypto";
import { ingestOfflineOpsAction, unlockOfflineWorkAction } from "./actions";

const stateBadge: Record<string, string> = {
  pending: "bg-brand-info/10 text-brand-info",
  synced: "bg-brand-success/10 text-brand-success",
  conflict: "bg-brand-pink/15 text-brand-error",
  rejected: "bg-brand-error/10 text-brand-error",
};

// The unlocked work session survives offline reloads (WP-B4). The decrypted
// pack stays in localStorage for member/tariff lookup while disconnected.
const LS_CODE = "medvex.offlineWorkCode";
const LS_PACK = "medvex.offlinePack";

interface PackSummary {
  memberCount: number;
  tariffCount: number;
  validUntil: string;
  roster: { memberNumber: string; firstName: string; lastName: string }[];
}

export function CaptureClient() {
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [online, setOnline] = useState(true);
  const [pending, start] = useTransition();
  const [code, setCode] = useState<string | null>(null);
  const [pack, setPack] = useState<PackSummary | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [conflictNote, setConflictNote] = useState<string | null>(null);

  const refresh = () => Outbox.all().then(setOps).catch(() => {});

  useEffect(() => {
    refresh();
    registerOfflineSync();
    // Restore an unlocked session (e.g. after an offline reload).
    try {
      const savedCode = localStorage.getItem(LS_CODE);
      const savedPack = localStorage.getItem(LS_PACK);
      if (savedCode) setCode(savedCode);
      if (savedPack) setPack(JSON.parse(savedPack));
    } catch { /* ignore */ }
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function unlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const entered = String(fd.get("workCode") || "").trim().toUpperCase();
    if (!entered) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await unlockOfflineWorkAction(entered);
      if (!res.ok) {
        setUnlockError(res.reason);
        return;
      }
      // Decrypt in the browser — the key comes from the code the operator
      // typed; the pack file alone is useless.
      const payload = await decryptPackInBrowser<{
        roster: PackSummary["roster"];
        tariffs: unknown[];
        validUntil: string;
      }>(entered, res.pack);
      const summary: PackSummary = {
        memberCount: payload.roster.length,
        tariffCount: payload.tariffs.length,
        validUntil: payload.validUntil,
        roster: payload.roster,
      };
      localStorage.setItem(LS_CODE, entered);
      localStorage.setItem(LS_PACK, JSON.stringify(summary));
      setCode(entered);
      setPack(summary);
    } catch {
      setUnlockError("Pack decryption failed — check the code and try again.");
    } finally {
      setUnlocking(false);
    }
  }

  function lock() {
    localStorage.removeItem(LS_CODE);
    localStorage.removeItem(LS_PACK);
    setCode(null);
    setPack(null);
  }

  async function capture(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await Outbox.enqueue({
      entityType: "Claim",
      payload: {
        memberNumber: fd.get("memberNumber"),
        providerCode: fd.get("providerCode"),
        serviceType: fd.get("serviceType"),
        dateOfService: new Date().toISOString(),
        offlineAuthCode: code,
        lineItems: [
          {
            description: fd.get("description"),
            quantity: Number(fd.get("quantity") || 1),
            unitCost: Number(fd.get("unitCost") || 0),
          },
        ],
      },
    });
    (e.target as HTMLFormElement).reset();
    refresh();
  }

  function syncNow() {
    start(async () => {
      const toSync = await Outbox.pending();
      if (toSync.length === 0) return;
      const res = await ingestOfflineOpsAction(
        toSync.map((o) => ({
          clientUuid: o.clientUuid,
          opKey: o.opKey,
          entityType: o.entityType,
          payload: o.payload,
          deviceId: o.deviceId,
          capturedAt: o.capturedAt,
        })),
        code ?? undefined,
      );
      // PR-036: mark each op with its TERMINAL server state — an op that
      // failed re-validation shows as a conflict with its reason, never as
      // "synced".
      for (const o of res.outcomes) {
        await Outbox.markState(o.opKey, o.state === "SYNCED" ? "synced" : "conflict");
      }
      const conflictReasons = res.outcomes
        .filter((o) => o.state !== "SYNCED")
        .map((o) => o.reason)
        .filter(Boolean);
      setConflictNote(
        res.conflicts > 0
          ? `${res.conflicts} operation(s) came back as CONFLICT — logged in the Exception Register for review, not lost.${conflictReasons[0] ? ` First reason: ${conflictReasons[0]}` : ""}`
          : null,
      );
      refresh();
    });
  }

  const pendingCount = ops.filter((o) => o.state === "pending").length;
  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  // ── Locked state (WP-B4): capture is gated on the agent-issued code ──────
  if (!code) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-lg border border-brand-border bg-brand-bg p-6 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-text-muted" />
        <h2 className="font-heading text-lg font-semibold text-brand-text-heading">Offline work is locked</h2>
        <p className="text-sm text-brand-text-muted">
          Call the claims desk to get an offline work code, then enter it here.
          While you are still connected, the facility data pack (members,
          balances, tariffs) downloads and unlocks capture — it keeps working
          when the connection drops.
        </p>
        <form onSubmit={unlock} className="space-y-3">
          <input
            name="workCode"
            placeholder="OWA-XXXXXX"
            autoComplete="off"
            className="w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-center font-mono text-lg uppercase tracking-[0.2em] outline-none focus:border-brand-teal"
          />
          {unlockError && <p className="text-sm text-brand-error">{unlockError}</p>}
          <button
            disabled={unlocking}
            className="inline-flex items-center gap-2 rounded-full bg-brand-indigo px-6 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" />
            {unlocking ? "Verifying…" : "Unlock offline work"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {online ? <Wifi className="h-4 w-4 text-brand-success" /> : <WifiOff className="h-4 w-4 text-brand-error" />}
          <span className={online ? "text-brand-success" : "text-brand-error"}>
            {online ? "Online" : "Offline — captures are queued locally"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-brand-text-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-success/10 px-2 py-1 font-semibold text-brand-success">
            <ShieldCheck className="h-3 w-3" /> {code}
          </span>
          {pack && (
            <span>
              Pack: {pack.memberCount} members · {pack.tariffCount} tariffs · valid until {new Date(pack.validUntil).toLocaleString()}
            </span>
          )}
          <button onClick={lock} className="font-semibold text-brand-error hover:underline">End session</button>
        </div>
      </div>

      <form onSubmit={capture} className="grid grid-cols-2 gap-4 rounded-lg border border-brand-border bg-brand-bg p-5 lg:grid-cols-3">
        <div>
          <label className={labelCls}>Member number</label>
          <input name="memberNumber" required className={inputCls} placeholder="MVX-2026-00001" list="offline-roster" />
          {/* Offline member lookup from the decrypted pack */}
          <datalist id="offline-roster">
            {pack?.roster.slice(0, 500).map((m) => (
              <option key={m.memberNumber} value={m.memberNumber}>{m.firstName} {m.lastName}</option>
            ))}
          </datalist>
        </div>
        <div><label className={labelCls}>Provider code</label><input name="providerCode" required className={inputCls} placeholder="SLD-001" /></div>
        <div>
          <label className={labelCls}>Service type</label>
          <select name="serviceType" className={inputCls} defaultValue="OUTPATIENT">
            {["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Description</label><input name="description" required className={inputCls} placeholder="Consultation" /></div>
        <div><label className={labelCls}>Qty</label><input name="quantity" type="number" min="1" defaultValue={1} className={inputCls} /></div>
        <div><label className={labelCls}>Unit cost</label><input name="unitCost" type="number" min="0" defaultValue={50000} className={inputCls} /></div>
        <div className="col-span-2 flex justify-end lg:col-span-3">
          <button className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-indigo-hover">Capture (offline-safe)</button>
        </div>
      </form>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-brand-text-muted">Outbox ({ops.length}) · {pendingCount} pending</h2>
        <button onClick={syncNow} disabled={pending || pendingCount === 0} className="inline-flex items-center gap-2 rounded-full border border-brand-border px-4 py-1.5 text-sm font-semibold text-brand-text-heading hover:bg-brand-bg-alt disabled:opacity-50">
          <UploadCloud className="h-4 w-4" />{pending ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {conflictNote && (
        <p className="rounded-lg border border-brand-error/30 bg-brand-error/5 px-4 py-2 text-sm text-brand-error">{conflictNote}</p>
      )}

      <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
        <div className="max-h-[45vh] overflow-y-auto overscroll-contain">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
              <tr><th className="px-4 py-2.5">Captured</th><th className="px-4 py-2.5">Entity</th><th className="px-4 py-2.5">Member</th><th className="px-4 py-2.5">State</th></tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {ops.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-brand-text-muted">Nothing captured yet.</td></tr>
              ) : ops.map((o) => (
                <tr key={o.opKey}>
                  <td className="px-4 py-2.5 text-brand-text-body">{new Date(o.capturedAt).toLocaleTimeString("en-UG")}</td>
                  <td className="px-4 py-2.5 text-brand-text-body">{o.entityType}</td>
                  <td className="px-4 py-2.5 font-mono text-brand-text-body">{String((o.payload as any)?.memberNumber ?? "—")}</td>
                  <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${stateBadge[o.state]}`}>{o.state}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
