"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function EndorsementFilters({
  statusFilter,
  typeFilter,
}: {
  statusFilter: string;
  typeFilter: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/hr/endorsements?${params.toString()}`);
  };

  return (
    <div className="flex gap-3">
      <select
        className="pl-4 pr-8 py-2 text-sm bg-white border border-[#EEEEEE] rounded-full outline-none text-avenue-text-body appearance-none shadow-sm cursor-pointer"
        value={statusFilter}
        onChange={(e) => update("status", e.target.value)}
      >
        <option value="">All Statuses</option>
        <option value="SUBMITTED">Submitted</option>
        <option value="UNDER_REVIEW">Under Review</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </select>
      <select
        className="px-4 pr-8 py-2 text-sm bg-white border border-[#EEEEEE] rounded-full outline-none text-avenue-text-body appearance-none shadow-sm cursor-pointer"
        value={typeFilter}
        onChange={(e) => update("type", e.target.value)}
      >
        <option value="">All Types</option>
        <option value="MEMBER_ADDITION">Member Addition</option>
        <option value="MEMBER_DELETION">Member Deletion</option>
        <option value="GROUP_DATA_CHANGE">Group Change</option>
      </select>
    </div>
  );
}
