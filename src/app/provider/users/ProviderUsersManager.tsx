"use client";

import { useActionState } from "react";
import { X, ShieldCheck, Building2, UserPlus } from "lucide-react";
import { inviteProviderUserAction, manageProviderUserAction } from "./actions";
import { InvitationStatus, type InvitationStateView } from "@/components/users/InvitationStatus";

interface UserRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  isSelf: boolean;
  roles: { code: string; label: string }[];
  branchNames: string[];
  /** Family Hospital UAT P05: the account holder has not set their own password yet. */
  pending: boolean;
  invitation: InvitationStateView | null;
}

interface Props {
  users: UserRow[];
  branches: { id: string; name: string }[];
  personaRoles: { code: string; label: string }[];
}

/**
 * Family Hospital UAT plan P05.04 — invite a staff member. The person receives
 * their own one-time link; nobody chooses or sees their password.
 */
function InviteStaffForm({ branches, personaRoles }: Pick<Props, "branches" | "personaRoles">) {
  const [state, action, pending] = useActionState(inviteProviderUserAction, null);
  const [resend, resendAction, resendPending] = useActionState(manageProviderUserAction, null);
  const input = "w-full rounded-lg border border-[#DDDDDD] px-3 py-2 text-sm focus:border-brand-indigo focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo/60";
  const label = "mb-1 block text-[11px] font-bold uppercase text-brand-text-muted";
  return (
    // Stays open while it has an outcome to show.
    <details className="rounded-lg border border-[#EEEEEE] bg-white p-5" open={state ? true : undefined}>
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-brand-indigo">
        <UserPlus size={16} aria-hidden="true" /> Invite a staff member
      </summary>
      {state?.ok ? (
        <p role="status" className={`mt-3 rounded-lg px-4 py-2.5 text-sm ${state.deliveryFailed ? "bg-[#FFC107]/15 text-[#856404]" : "bg-[#28A745]/10 text-[#1E7B34]"}`}>
          {state.message}
        </p>
      ) : null}
      {state?.error ? (
        <div role="alert" className="mt-3 rounded-lg bg-[#DC3545]/10 px-4 py-2.5 text-sm text-[#DC3545]">
          {state.error}
          {state.resendUserId ? (
            <form action={resendAction} className="mt-1">
              <input type="hidden" name="_op" value="resend" />
              <input type="hidden" name="targetUserId" value={state.resendUserId} />
              <button type="submit" disabled={resendPending} className="text-xs font-semibold text-brand-indigo underline disabled:opacity-50">
                {resendPending ? "Sending…" : "Send a new setup link"}
              </button>
            </form>
          ) : null}
          {resend?.ok ? <p role="status" className="mt-1 text-xs text-brand-text-body">{resend.ok}</p> : null}
          {resend?.error ? <p role="alert" className="mt-1 text-xs">{resend.error}</p> : null}
        </div>
      ) : null}
      <form action={action} className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="inv-first" className={label}>First name</label>
          <input id="inv-first" name="firstName" required maxLength={100} autoComplete="off" className={input} />
        </div>
        <div>
          <label htmlFor="inv-last" className={label}>Last name</label>
          <input id="inv-last" name="lastName" required maxLength={100} autoComplete="off" className={input} />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="inv-email" className={label}>Email address</label>
          <input id="inv-email" name="email" type="email" required maxLength={254} autoComplete="off" className={input} />
          <p className="mt-1 text-[11px] text-brand-text-muted">Use the person&apos;s own address — the setup link goes only to them.</p>
        </div>
        <div>
          <label htmlFor="inv-role" className={label}>Role</label>
          <select id="inv-role" name="providerRoleCode" required className={`${input} bg-white`}>
            <option value="">Choose a role…</option>
            {personaRoles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className={label}>Branches</legend>
          {branches.length === 0 ? (
            <p className="text-xs text-[#856404]">You have no branches you can assign.</p>
          ) : (
            <div className="space-y-1">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="providerBranchIds" value={b.id} defaultChecked={branches.length === 1} /> {b.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" disabled={pending} className="rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary disabled:opacity-50">
            {pending ? "Sending…" : "Send invitation"}
          </button>
        </div>
      </form>
    </details>
  );
}

export function ProviderUsersManager({ users, branches, personaRoles }: Props) {
  const [state, action, pending] = useActionState(manageProviderUserAction, null);

  return (
    <div className="space-y-4">
      <InviteStaffForm branches={branches} personaRoles={personaRoles} />
      {state?.error && (
        <div className="rounded-lg bg-[#DC3545]/10 border border-[#DC3545]/30 px-4 py-2.5 text-sm text-[#DC3545]" role="alert">{state.error}</div>
      )}
      {state?.ok && (
        <div className="rounded-lg bg-[#28A745]/10 border border-[#28A745]/30 px-4 py-2.5 text-sm text-[#28A745]" role="status">{state.ok}</div>
      )}

      {users.length === 0 ? (
        <div className="rounded-lg border border-[#EEEEEE] bg-white px-5 py-10 text-center text-sm text-brand-text-muted">
          No staff accounts yet. Invite your staff above — each person gets their own setup link.
        </div>
      ) : (
        <ul className="space-y-4">
          {users.map((u) => (
            <li key={u.id} className="rounded-lg border border-[#EEEEEE] bg-white p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-brand-text-heading">
                    {u.name}
                    {u.isSelf && <span className="ml-2 text-[10px] font-bold uppercase text-brand-text-muted">You</span>}
                  </p>
                  <p className="text-xs text-brand-text-muted">{u.email}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.isActive ? (u.pending ? "bg-[#FFC107]/15 text-[#856404]" : "bg-[#28A745]/10 text-[#28A745]") : "bg-[#E6E7E8] text-[#6C757D]"}`}>
                  {u.isActive ? (u.pending ? "NOT SET UP" : "ACTIVE") : "SUSPENDED"}
                </span>
              </div>
              {u.pending && u.isActive ? (
                <InvitationStatus userId={u.id} state={u.invitation} canResend resendAction={manageProviderUserAction} extraFields={{ _op: "resend" }} />
              ) : null}

              {/* Roles */}
              <div>
                <p className="text-[11px] uppercase font-bold text-brand-text-muted mb-1 flex items-center gap-1"><ShieldCheck size={12} /> Duty roles</p>
                {u.roles.length === 0 ? (
                  <p className="text-xs text-[#856404]">No duty role — this user cannot access facility data until one is assigned.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.map((r) => (
                      <form key={r.code} action={action} className="inline-flex">
                        <input type="hidden" name="_op" value="revoke_role" />
                        <input type="hidden" name="targetUserId" value={u.id} />
                        <input type="hidden" name="roleCode" value={r.code} />
                        <span className="inline-flex items-center gap-1 text-xs bg-[#E6E7E8] text-[#495057] rounded-full pl-2.5 pr-1 py-0.5">
                          {r.label}
                          <button type="submit" disabled={pending} title="Revoke role" className="rounded-full hover:bg-[#DC3545]/20 hover:text-[#DC3545] p-0.5 disabled:opacity-50">
                            <X size={11} />
                          </button>
                        </span>
                      </form>
                    ))}
                  </div>
                )}
                <form action={action} className="mt-2 flex items-end gap-2">
                  <input type="hidden" name="_op" value="assign_role" />
                  <input type="hidden" name="targetUserId" value={u.id} />
                  <select name="roleCode" required className="border border-[#EEEEEE] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-brand-indigo bg-white">
                    <option value="">Add a role…</option>
                    {personaRoles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                  <button type="submit" disabled={pending} className="rounded-full bg-brand-indigo px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-secondary disabled:opacity-50">Assign</button>
                </form>
              </div>

              {/* Branches */}
              <div>
                <p className="text-[11px] uppercase font-bold text-brand-text-muted mb-1 flex items-center gap-1"><Building2 size={12} /> Branch access</p>
                {u.branchNames.length === 0 ? (
                  <p className="text-xs text-[#856404]">No branch — branch-scoped resources are denied until a branch is assigned.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {u.branchNames.map((b) => (
                      <span key={b} className="text-xs bg-[#E6E7E8] text-[#495057] rounded-full px-2.5 py-0.5">{b}</span>
                    ))}
                  </div>
                )}
                {branches.length > 0 && (
                  <form action={action} className="mt-2 flex items-end gap-2">
                    <input type="hidden" name="_op" value="assign_branches" />
                    <input type="hidden" name="targetUserId" value={u.id} />
                    <select name="branchIds" multiple required className="min-h-16 border border-[#EEEEEE] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-brand-indigo bg-white">
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button type="submit" disabled={pending} className="rounded-full bg-brand-indigo px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-secondary disabled:opacity-50">Assign</button>
                  </form>
                )}
              </div>

              {/* Lifecycle */}
              {!u.isSelf && (
                <div className="pt-1">
                  {u.isActive ? (
                    <form action={action}>
                      <input type="hidden" name="_op" value="suspend" />
                      <input type="hidden" name="targetUserId" value={u.id} />
                      <button type="submit" disabled={pending} className="text-xs font-semibold text-[#DC3545] hover:underline disabled:opacity-50">Suspend user</button>
                    </form>
                  ) : (
                    <form action={action}>
                      <input type="hidden" name="_op" value="reactivate" />
                      <input type="hidden" name="targetUserId" value={u.id} />
                      <button type="submit" disabled={pending} className="text-xs font-semibold text-brand-indigo hover:underline disabled:opacity-50">Reactivate user</button>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
