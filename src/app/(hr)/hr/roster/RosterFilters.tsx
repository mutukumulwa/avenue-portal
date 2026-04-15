"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";

export function RosterFilters({
  statusFilter,
  relFilter,
}: {
  statusFilter: string;
  relFilter: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/hr/roster?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-avenue-text-muted pointer-events-none">
          <Filter className="w-3.5 h-3.5" />
        </span>
        <select
          className="pl-8 pr-8 py-2 text-sm bg-white border border-[#EEEEEE] rounded-full outline-none text-avenue-text-body appearance-none shadow-sm cursor-pointer"
          value={statusFilter}
          onChange={(e) => update("status", e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_ACTIVATION">Pending</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="LAPSED">Lapsed</option>
        </select>
      </div>
      <div className="relative">
        <select
          className="px-4 pr-8 py-2 text-sm bg-white border border-[#EEEEEE] rounded-full outline-none text-avenue-text-body appearance-none shadow-sm cursor-pointer"
          value={relFilter}
          onChange={(e) => update("relationship", e.target.value)}
        >
          <option value="">All Relationships</option>
          <option value="PRINCIPAL">Principal</option>
          <option value="SPOUSE">Spouse</option>
          <option value="CHILD">Child</option>
          <option value="PARENT">Parent</option>
        </select>
      </div>
    </div>
  );
}
