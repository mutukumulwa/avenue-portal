"use client";

import { useActionState, useState } from "react";
import { inviteUserAction } from "./actions";
import { X } from "lucide-react";

const ROLES = [
  { value: "CLAIMS_OFFICER",  label: "Claims Officer"  },
  { value: "FINANCE_OFFICER", label: "Finance Officer"  },
  { value: "MEDICAL_OFFICER", label: "Medical Officer"  },
  { value: "UNDERWRITER",     label: "Underwriter"      },
  { value: "CUSTOMER_SERVICE",label: "Customer Service" },
  { value: "REPORTS_VIEWER",  label: "Reports Viewer"   },
  { value: "SUPER_ADMIN",     label: "Super Admin"      },
  { value: "HR_MANAGER",      label: "HR Manager"       },
];

export function InviteUserModal({ groups = [] }: { groups?: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [state, action, pending] = useActionState(inviteUserAction, null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors"
      >
        + Invite User
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-avenue-text-muted hover:text-avenue-text-heading"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-bold text-avenue-text-heading font-heading mb-4">Invite User</h2>

            {state?.error && (
              <div className="mb-4 px-4 py-2.5 bg-[#DC3545]/10 text-[#DC3545] text-sm rounded-lg">
                {state.error}
              </div>
            )}

            <form action={action} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">First Name</label>
                  <input name="firstName" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Last Name</label>
                  <input name="lastName" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Email</label>
                <input name="email" type="email" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo" />
              </div>
              <div>
                <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Role</label>
                <select 
                  name="role" 
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  required 
                  className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo bg-white"
                >
                  <option value="">Select role…</option>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              
              {selectedRole === "HR_MANAGER" && (
                <div>
                  <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Assign to Group</label>
                  <select 
                    name="groupId" 
                    required 
                    className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo bg-white"
                  >
                    <option value="">Select corporate group…</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Temporary Password</label>
                <input name="password" type="password" minLength={8} required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo" />
                <p className="text-[10px] text-avenue-text-muted mt-1">Min. 8 characters. User should change on first login.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-avenue-text-body border border-[#EEEEEE] rounded-full hover:bg-[#F8F9FA] transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="px-5 py-2 text-sm font-semibold bg-avenue-indigo hover:bg-avenue-secondary text-white rounded-full transition-colors disabled:opacity-60">
                  {pending ? "Inviting…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
