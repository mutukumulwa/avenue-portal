"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";

const inputCls = "border border-[#EEEEEE] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";

const MODULES = ["MEMBERS", "GROUPS", "CLAIMS", "PREAUTH", "BILLING", "PROVIDERS", "BROKERS", "SETTINGS", "ENDORSEMENTS"];

interface Props {
  users: { id: string; firstName: string; lastName: string }[];
}

export function AuditLogFilters({ users }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const sp = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      if (v) sp.set(k, v as string);
    }
    router.push(`${pathname}?${sp.toString()}`);
  }

  function clear() { router.push(pathname); }

  return (
    <form onSubmit={apply} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm flex flex-wrap items-end gap-3">
      <div>
        <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-1">User</label>
        <select name="userId" defaultValue={params.get("userId") ?? ""} className={inputCls}>
          <option value="">All users</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-1">Module</label>
        <select name="module" defaultValue={params.get("module") ?? ""} className={inputCls}>
          <option value="">All modules</option>
          {MODULES.map(m => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
        </select>
      </div>
      <div>
        <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-1">From</label>
        <input type="date" name="dateFrom" defaultValue={params.get("dateFrom") ?? ""} className={inputCls} />
      </div>
      <div>
        <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-1">To</label>
        <input type="date" name="dateTo" defaultValue={params.get("dateTo") ?? ""} className={inputCls} />
      </div>
      <div>
        <label className="text-[10px] font-bold text-avenue-text-muted uppercase block mb-1">Search</label>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-avenue-text-muted" />
          <input
            type="text"
            name="q"
            defaultValue={params.get("q") ?? ""}
            placeholder="Description…"
            className={inputCls + " pl-7 w-48"}
          />
        </div>
      </div>
      <div className="flex gap-2 ml-auto">
        <button type="button" onClick={clear} className="text-xs text-avenue-text-muted hover:text-avenue-text-heading px-3 py-1.5 rounded-lg border border-[#EEEEEE] transition-colors">
          Clear
        </button>
        <button type="submit" className="text-xs font-semibold text-white bg-avenue-indigo hover:bg-avenue-secondary px-4 py-1.5 rounded-lg transition-colors">
          Filter
        </button>
      </div>
    </form>
  );
}
