"use client";

/**
 * UAT-HF P07.03 — a cover-changing action, with the ceremony the run found
 * missing (DEF-040, DEF-059).
 *
 * DEF-059: '"Lapse Manually" moved a member ACTIVE to LAPSED immediately on
 * click: no browser dialog fired, no in-product confirmation appeared, no reason
 * was captured. "Reinstate (within catch-up window)" moved it back LAPSED to
 * ACTIVE the same way. On the same screen, Terminate (Breach) sits under a
 * "TERMINATION (REQUIRES SENIOR APPROVAL)" heading with a required reason code
 * ... **So the governance exists in the product and is simply not applied to the
 * two reversible actions that change live cover — the ones an operator is most
 * likely to click by accident.**'
 *
 * That last sentence is the whole design brief. Nothing new is invented here;
 * the pattern already on the screen is extended to the actions that skipped it.
 *
 * DEF-040 is the same shape on "Standard Cancel": "terminates a member on a
 * single click — no confirmation, no date, no reason, a computed refund, and no
 * audit entry". The register calls DEF-059 "the third confirmed instance of the
 * one-click-destructive pattern".
 *
 * The confirmation is `ConfirmDialog` (P01.06), which already guarantees the
 * acceptance's hardest clause: **Enter inside a reason or date field cannot
 * trigger the transition.**
 */

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export interface GovernedActionProps {
  /** The server action this ultimately submits to. */
  action: (formData: FormData) => void | Promise<void>;
  memberId: string;
  /** e.g. "UX26-2026-00030 — Amina Nabirye Kato". Named in the dialog. */
  memberLabel: string;
  /** Button text, unchanged from the screen the run tested. */
  label: string;
  title: string;
  /** Current → new state, last covered day, money. Spelled out, not summarised. */
  consequences: React.ReactNode;
  confirmLabel: string;
  tone?: "default" | "destructive";
  /** Type-to-confirm phrase for anything irreversible. */
  requiredPhrase?: string;
  buttonClassName?: string;
  /** Extra inputs shown inside the dialog — reason code, effective date. */
  children?: React.ReactNode;
  /** When true, a free-text reason is required and posted as `reason`. */
  requireReason?: boolean;
}

export function GovernedLifecycleAction({
  action,
  memberId,
  memberLabel,
  label,
  title,
  consequences,
  confirmLabel,
  tone = "destructive",
  requiredPhrase,
  buttonClassName,
  children,
  requireReason = true,
}: GovernedActionProps) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "border border-[#6C757D] text-[#6C757D] px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-[#6C757D]/10 transition-colors"
        }
      >
        {label}
      </button>

      {/*
        The form lives outside the dialog and is submitted programmatically on
        confirm. That keeps the dialog's inputs inside a real <form> for
        submission while ensuring the ONLY route to submit is the confirm
        button — there is no default Enter target, which is the acceptance:
        "Enter in a reason/date field cannot trigger transition".
      */}
      <form ref={formRef} action={action} className="contents">
        <input type="hidden" name="memberId" value={memberId} />

        <ConfirmDialog
          open={open}
          objectLabel={memberLabel}
          title={title}
          consequences={consequences}
          confirmLabel={confirmLabel}
          tone={tone}
          requiredPhrase={requiredPhrase}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            formRef.current?.requestSubmit();
          }}
        >
          {children}
          {requireReason && (
            <div>
              <label
                className="block text-xs font-bold uppercase text-brand-text-muted mb-1"
                htmlFor={`reason-${memberId}-${label}`}
              >
                Reason (recorded in the audit trail)
              </label>
              <input
                id={`reason-${memberId}-${label}`}
                name="reason"
                required
                minLength={5}
                placeholder="Why is this happening?"
                className="w-full rounded-lg border border-[#EEEEEE] px-3 py-2 text-sm focus:border-brand-indigo focus:outline-none"
              />
            </div>
          )}
        </ConfirmDialog>
      </form>
    </>
  );
}
