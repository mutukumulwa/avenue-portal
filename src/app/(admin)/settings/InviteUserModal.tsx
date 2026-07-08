"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { inviteUserAction } from "./actions";
import { X } from "lucide-react";
import { MemberSearchPicker } from "@/components/ui/MemberSearchPicker";

const ROLES = [
  { value: "CLAIMS_OFFICER",  label: "Claims Officer"  },
  { value: "FINANCE_OFFICER", label: "Finance Officer"  },
  { value: "MEDICAL_OFFICER", label: "Medical Officer"  },
  { value: "UNDERWRITER",     label: "Underwriter"      },
  { value: "CUSTOMER_SERVICE",label: "Customer Service" },
  { value: "REPORTS_VIEWER",  label: "Reports Viewer"   },
  { value: "SUPER_ADMIN",     label: "Super Admin"      },
  { value: "HR_MANAGER",      label: "HR Manager"       },
  { value: "BROKER_USER",     label: "Broker User"      },
  { value: "MEMBER_USER",     label: "Member User"      },
  { value: "FUND_ADMINISTRATOR", label: "Fund Administrator" },
  { value: "PROVIDER_USER",   label: "Provider (Facility)" },
];

interface InviteUserModalProps {
  groups?: { id: string; name: string }[];
  brokers?: { id: string; name: string }[];
  fundGroups?: { id: string; name: string }[];
  providers?: { id: string; name: string }[];
}

export function InviteUserModal({ groups = [], brokers = [], fundGroups = [], providers = [] }: InviteUserModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [state, action, pending] = useActionState(inviteUserAction, null);

  // OBS-1: on a successful invite, close the modal and refresh so the Users &
  // Access list re-renders immediately (previously it stayed blank until reload).
  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setSelectedRole("");
      router.refresh();
    }
  }, [state, router]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-brand-indigo hover:bg-brand-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors"
      >
        + Invite User
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-brand-text-muted hover:text-brand-text-heading"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-bold text-brand-text-heading font-heading mb-4">Invite User</h2>

            {state?.error && (
              <div className="mb-4 px-4 py-2.5 bg-[#DC3545]/10 text-[#DC3545] text-sm rounded-lg">
                {state.error}
              </div>
            )}

            <form action={action} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">First Name</label>
                  <input name="firstName" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Last Name</label>
                  <input name="lastName" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Email</label>
                <input name="email" type="email" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo" />
              </div>
              <div>
                <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Role</label>
                <select 
                  name="role" 
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  required 
                  className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo bg-white"
                >
                  <option value="">Select role…</option>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              
              {selectedRole === "HR_MANAGER" && (
                <div>
                  <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Assign to Group</label>
                  <select 
                    name="groupId" 
                    required 
                    className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo bg-white"
                  >
                    <option value="">Select corporate group…</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {selectedRole === "BROKER_USER" && (
                <div>
                  <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Broker Profile</label>
                  <select name="brokerId" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo bg-white">
                    <option value="">Select broker…</option>
                    {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {selectedRole === "MEMBER_USER" && (
                <div>
                  <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Member Profile</label>
                  {/* E2E-OBS-MEMSEL: async scoped lookup over the full roster (was a ~250-cap select). */}
                  <MemberSearchPicker />
                  <p className="text-[10px] text-brand-text-muted mt-1">Search any unlinked member across the roster by name, member number or scheme.</p>
                </div>
              )}
              {selectedRole === "PROVIDER_USER" && (
                <div>
                  <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Facility</label>
                  <select name="providerId" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo bg-white">
                    <option value="">Select facility…</option>
                    {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <p className="text-[10px] text-brand-text-muted mt-1">This user will only see this facility&apos;s eligibility, claims and settlements.</p>
                </div>
              )}
              {selectedRole === "FUND_ADMINISTRATOR" && (
                <div>
                  <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Self-Funded Schemes</label>
                  <select name="fundGroupIds" multiple required className="w-full min-h-28 border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo bg-white">
                    {fundGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <p className="text-[10px] text-brand-text-muted mt-1">Hold Command/Ctrl to select multiple schemes.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-brand-text-muted uppercase mb-1">Temporary Password</label>
                <input name="password" type="password" minLength={8} required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo" />
                <p className="text-[10px] text-brand-text-muted mt-1">Min. 8 characters. User should change on first login.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-brand-text-body border border-[#EEEEEE] rounded-full hover:bg-[#F8F9FA] transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="px-5 py-2 text-sm font-semibold bg-brand-indigo hover:bg-brand-secondary text-white rounded-full transition-colors disabled:opacity-60">
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
