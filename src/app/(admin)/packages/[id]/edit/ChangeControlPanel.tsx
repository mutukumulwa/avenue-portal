"use client";

/**
 * UAT-HF P09.01 — the surface for draft → approve → activate (DEF-024).
 *
 * The engine landed without controls, which meant a maker's edit produced a
 * draft nobody could activate through the product. This is the missing half.
 *
 * The run's complaint was not only that a change went live unreviewed — it was
 * that nothing said anything: "no approval requested, no Draft/Pending/Approved
 * state, and no feedback message of any kind — no toast and no role='alert'
 * element." So this panel's job is as much to *state where the change is* as it
 * is to move it along.
 */

import { useActionState } from "react";
import { CheckCircle2, Send, XCircle, Clock, ShieldCheck } from "lucide-react";
import {
  approvePackageVersionAction,
  rejectPackageVersionAction,
  submitPackageVersionAction,
  type VersionMoved,
} from "./change-control-actions";
import { PACKAGE_VERSION_STATUS_LABEL, type PackageVersionStatus } from "@/server/services/package-change-control.service";
import { formatInstant } from "@/lib/calendar-date";
import type { MutationResult } from "@/lib/mutation-contract";

export interface VersionRow {
  id: string;
  versionNumber: number;
  status: PackageVersionStatus;
  effectiveFrom: string; // ISO
  submittedById: string | null;
  isCurrent: boolean;
}

const CHIP: Record<PackageVersionStatus, string> = {
  DRAFT: "bg-[#E6E7E8] text-[#6C757D]",
  PENDING_APPROVAL: "bg-[#FFC107]/20 text-[#856404]",
  APPROVED: "bg-[#17A2B8]/15 text-[#0F6674]",
  ACTIVE: "bg-[#28A745]/15 text-[#1E7E34]",
  SUPERSEDED: "bg-[#E6E7E8] text-[#6C757D]",
  REJECTED: "bg-[#DC3545]/10 text-[#DC3545]",
};

export function ChangeControlPanel({
  packageId,
  versions,
  viewerId,
}: {
  packageId: string;
  versions: VersionRow[];
  /** Used only to explain WHY approve is unavailable, never to authorise. */
  viewerId: string;
}) {
  const pending = versions.filter((v) => v.status === "PENDING_APPROVAL");
  const drafts = versions.filter((v) => v.status === "DRAFT");
  const live = versions.find((v) => v.status === "ACTIVE");

  return (
    <section className="min-w-0 rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#EEEEEE] pb-2">
        <ShieldCheck size={15} className="text-brand-indigo" />
        <h2 className="font-heading font-bold text-brand-text-heading">Change control</h2>
      </div>

      <p className="mt-2 text-xs text-brand-text-muted">
        A coverage change is saved as a <strong>draft</strong> and does not affect any member until
        a different colleague approves it. Editing above never changes live cover.
      </p>

      <div className="mt-3 space-y-2">
        {live && (
          <VersionLine
            row={live}
            note="This is what members are covered by right now."
          />
        )}

        {drafts.map((v) => (
          <VersionLine key={v.id} row={v} note="Not live. Send it for approval when it is ready.">
            <SubmitControl packageId={packageId} versionId={v.id} />
          </VersionLine>
        ))}

        {pending.map((v) => (
          <VersionLine
            key={v.id}
            row={v}
            note={
              v.submittedById === viewerId
                ? "You submitted this, so somebody else has to approve it."
                : "Waiting for you or another authorised checker."
            }
          >
            {v.submittedById === viewerId ? (
              <p className="text-[11px] font-semibold text-[#856404]">
                You cannot approve your own change.
              </p>
            ) : (
              <DecideControls packageId={packageId} versionId={v.id} />
            )}
          </VersionLine>
        ))}

        {versions.length === 0 && (
          <p className="text-sm text-brand-text-muted">No versions yet.</p>
        )}
      </div>
    </section>
  );
}

function VersionLine({
  row,
  note,
  children,
}: {
  row: VersionRow;
  note: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#EEEEEE] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold text-brand-text-heading">v{row.versionNumber}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CHIP[row.status]}`}>
          {row.status.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-brand-text-muted">{PACKAGE_VERSION_STATUS_LABEL[row.status]}</span>
        {row.status === "APPROVED" && (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#0F6674]">
            <Clock size={11} />
            effective {formatInstant(new Date(row.effectiveFrom))}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-brand-text-muted">{note}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

function SubmitControl({ packageId, versionId }: { packageId: string; versionId: string }) {
  const bound = submitPackageVersionAction.bind(null, packageId);
  const [state, action, pending] = useActionState<MutationResult<VersionMoved> | null, FormData>(bound, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-indigo px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        <Send size={12} />
        {pending ? "Sending…" : "Send for approval"}
      </button>
      <Outcome state={state} okText="Sent — a different colleague must now approve it." />
    </form>
  );
}

function DecideControls({ packageId, versionId }: { packageId: string; versionId: string }) {
  const approve = approvePackageVersionAction.bind(null, packageId);
  const reject = rejectPackageVersionAction.bind(null, packageId);
  const [approveState, approveAction, approving] = useActionState<MutationResult<VersionMoved> | null, FormData>(approve, null);
  const [rejectState, rejectAction, rejecting] = useActionState<MutationResult<VersionMoved> | null, FormData>(reject, null);

  return (
    <div className="space-y-2">
      <form action={approveAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="versionId" value={versionId} />
        <button
          type="submit"
          disabled={approving}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#28A745] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <CheckCircle2 size={12} />
          {approving ? "Approving…" : "Approve and make live"}
        </button>
        <Outcome state={approveState} okText="Approved. Members are now covered by this version." />
      </form>

      <form action={rejectAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="versionId" value={versionId} />
        <label className="sr-only" htmlFor={`reject-${versionId}`}>
          Why are you rejecting this version?
        </label>
        <input
          id={`reject-${versionId}`}
          name="reason"
          required
          minLength={5}
          placeholder="Reason — the maker needs to know what to change"
          className="min-w-0 flex-1 rounded border border-[#EEEEEE] px-2 py-1.5 text-xs"
        />
        <button
          type="submit"
          disabled={rejecting}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#DC3545] px-4 py-1.5 text-xs font-semibold text-[#DC3545] disabled:opacity-50"
        >
          <XCircle size={12} />
          {rejecting ? "Rejecting…" : "Reject"}
        </button>
        <Outcome state={rejectState} okText="Rejected. The maker can rework it." />
      </form>
    </div>
  );
}

/**
 * The feedback the run found entirely absent — "no toast and no role='alert'
 * element" — for both outcomes, not only failures.
 */
function Outcome({ state, okText }: { state: MutationResult<VersionMoved> | null; okText: string }) {
  if (!state) return null;
  return state.ok ? (
    <span role="status" className="text-[11px] font-semibold text-[#1E7E34]">
      {okText}
    </span>
  ) : (
    <span role="alert" className="text-[11px] font-semibold text-[#DC3545]">
      {state.message}
    </span>
  );
}
