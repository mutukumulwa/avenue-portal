"use client";

import { useActionState } from "react";
import { updateProfileAction } from "./actions";
import { CheckCircle } from "lucide-react";

type Member = {
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
};

export function ProfileForm({ member }: { member: Member }) {
  const [result, action, isPending] = useActionState(updateProfileAction, null);

  return (
    <form action={action} className="space-y-4">
      {result?.success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-[#28A745]/10 text-[#28A745] rounded-lg text-sm font-semibold">
          <CheckCircle size={16} />
          Contact details updated successfully.
        </div>
      )}
      {result?.error && (
        <div className="px-4 py-3 bg-[#DC3545]/10 text-[#DC3545] rounded-lg text-sm">
          {result.error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">First Name</label>
          <input
            type="text"
            value={member.firstName}
            disabled
            className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm bg-[#F8F9FA] text-avenue-text-muted cursor-not-allowed"
          />
          <p className="text-[10px] text-avenue-text-muted mt-1">Contact Avenue to change your name.</p>
        </div>
        <div>
          <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Last Name</label>
          <input
            type="text"
            value={member.lastName}
            disabled
            className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm bg-[#F8F9FA] text-avenue-text-muted cursor-not-allowed"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Phone Number</label>
        <input
          name="phone"
          type="tel"
          defaultValue={member.phone ?? ""}
          placeholder="+254 7XX XXX XXX"
          className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Email Address</label>
        <input
          name="email"
          type="email"
          defaultValue={member.email ?? ""}
          placeholder="you@example.com"
          className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo transition-colors"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2.5 rounded-full font-semibold text-sm transition-colors disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}
