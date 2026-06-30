"use client";

import { useMemo, useState } from "react";

type MemberOption = {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  groupName: string | null;
};

export function MemberLookup({
  members,
  name,
  label = "Member",
}: {
  members: MemberOption[];
  name: string;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MemberOption | null>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members.slice(0, 8);
    return members
      .filter((member) => {
        const haystack = `${member.firstName} ${member.lastName} ${member.memberNumber} ${member.groupName ?? ""}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 12);
  }, [members, query]);

  return (
    <label className="block">
      <span className="text-[13px] font-medium text-brand-text-muted">{label}</span>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
        }}
        placeholder="Search by name, member number, or group"
        className="mt-1 w-full rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm text-brand-text-heading outline-none focus:border-brand-indigo"
      />
      {selected && (
        <p className="mt-2 rounded-[8px] bg-brand-indigo/10 px-3 py-2 text-sm font-semibold text-brand-indigo">
          Selected: {selected.firstName} {selected.lastName} - {selected.memberNumber}
        </p>
      )}
      <div className="mt-2 max-h-56 overflow-y-auto rounded-[8px] border border-[#EEEEEE] bg-white">
        {results.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => {
              setSelected(member);
              setQuery(`${member.firstName} ${member.lastName} - ${member.memberNumber}`);
            }}
            className="block w-full border-b border-[#EEEEEE] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-brand-bg-alt"
          >
            <span className="block font-semibold text-brand-text-heading">
              {member.firstName} {member.lastName}
            </span>
            <span className="block text-xs text-brand-text-muted">
              {member.memberNumber}{member.groupName ? ` - ${member.groupName}` : ""}
            </span>
          </button>
        ))}
        {results.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-brand-text-muted">No matching members found.</p>
        )}
      </div>
    </label>
  );
}
