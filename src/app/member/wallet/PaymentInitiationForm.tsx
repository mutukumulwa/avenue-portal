"use client";

import { useActionState } from "react";
import { Smartphone, WalletCards } from "lucide-react";
import { initiateMpesaPaymentAction } from "./actions";

const inputClass = "w-full rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo";

export function PaymentInitiationForm({
  transactionId,
  defaultPhone,
  disabled,
}: {
  transactionId: string;
  defaultPhone: string | null;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(initiateMpesaPaymentAction, null);

  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="transactionId" value={transactionId} />
      <label className="block space-y-1">
        <span className="text-xs font-bold uppercase text-brand-text-muted">M-Pesa phone</span>
        <input
          name="phoneNumber"
          defaultValue={defaultPhone ?? ""}
          placeholder="+254712345678"
          className={inputClass}
          disabled={disabled || pending}
        />
      </label>
      {state?.error && (
        <p className="rounded-[8px] border border-[#DC3545]/25 bg-[#DC3545]/5 px-3 py-2 text-sm text-[#B02A37]">
          {state.error}
        </p>
      )}
      {state?.checkoutRequestId && (
        <p className="rounded-[8px] border border-[#17A2B8]/25 bg-[#17A2B8]/5 px-3 py-2 text-sm text-[#0F6F7D]">
          Sandbox checkout requested. Reference: {state.checkoutRequestId}
        </p>
      )}
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-brand-indigo px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-indigo-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Smartphone className="h-4 w-4 animate-pulse" /> : <WalletCards className="h-4 w-4" />}
        {pending ? "Requesting checkout..." : disabled ? "Awaiting callback" : "Pay with M-Pesa"}
      </button>
    </form>
  );
}
