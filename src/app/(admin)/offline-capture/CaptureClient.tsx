"use client";

import { useEffect, useState, useTransition } from "react";
import { WifiOff, Wifi, UploadCloud } from "lucide-react";
import { Outbox, registerOfflineSync, type OutboxOp } from "@/lib/offline/outbox";
import { ingestOfflineOpsAction } from "./actions";

const stateBadge: Record<string, string> = {
  pending: "bg-brand-info/10 text-brand-info",
  synced: "bg-brand-success/10 text-brand-success",
  conflict: "bg-brand-pink/15 text-brand-error",
  rejected: "bg-brand-error/10 text-brand-error",
};

export function CaptureClient() {
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [online, setOnline] = useState(true);
  const [pending, start] = useTransition();

  const refresh = () => Outbox.all().then(setOps).catch(() => {});

  useEffect(() => {
    refresh();
    registerOfflineSync();
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

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
      );
      for (const opKey of res.syncedOpKeys) await Outbox.markState(opKey, "synced");
      refresh();
    });
  }

  const pendingCount = ops.filter((o) => o.state === "pending").length;
  const inputCls =
    "mt-1 w-full rounded-md border border-brand-border bg-brand-bg px-3 py-2 text-sm outline-none focus:border-brand-teal focus:ring-1 focus:ring-brand-teal";
  const labelCls = "text-xs font-semibold uppercase text-brand-text-muted";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        {online ? <Wifi className="h-4 w-4 text-brand-success" /> : <WifiOff className="h-4 w-4 text-brand-error" />}
        <span className={online ? "text-brand-success" : "text-brand-error"}>
          {online ? "Online" : "Offline — captures are queued locally"}
        </span>
      </div>

      <form onSubmit={capture} className="grid grid-cols-2 gap-4 rounded-lg border border-brand-border bg-brand-bg p-5 lg:grid-cols-3">
        <div><label className={labelCls}>Member number</label><input name="memberNumber" required className={inputCls} placeholder="MVX-2026-00001" /></div>
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

      <div className="overflow-hidden rounded-lg border border-brand-border bg-brand-bg">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg-alt text-left text-xs uppercase text-brand-text-muted">
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
  );
}
