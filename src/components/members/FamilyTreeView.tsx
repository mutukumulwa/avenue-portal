"use client";

import Link from "next/link";
import { Users, User, Heart, Baby, Crown } from "lucide-react";

interface FamilyMember {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  relationship: string;
  status: string;
  dateOfBirth?: Date | string | null;
}

interface Props {
  principal: FamilyMember;
  dependants: FamilyMember[];
  highlightId?: string;  // currently-viewed member
}

const STATUS_DOT: Record<string, string> = {
  ACTIVE:            "bg-[#28A745]",
  SUSPENDED:         "bg-[#FFC107]",
  LAPSED:            "bg-[#DC3545]",
  TERMINATED:        "bg-[#6C757D]",
  TERMINATED_DEATH:  "bg-[#6C757D]",
  PENDING_ACTIVATION:"bg-[#17A2B8]",
};

const REL_ICON: Record<string, React.ReactNode> = {
  PRINCIPAL: <Crown size={13} className="text-brand-indigo" />,
  SPOUSE:    <Heart size={13} className="text-[#DC3545]" />,
  CHILD:     <Baby size={13} className="text-[#17A2B8]" />,
  PARENT:    <User size={13} className="text-[#856404]" />,
};

function age(dob?: Date | string | null): string {
  if (!dob) return "";
  const d = new Date(dob);
  const years = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return `${years}y`;
}

function MemberCard({ member, isHighlighted }: { member: FamilyMember; isHighlighted: boolean }) {
  return (
    <Link href={`/members/${member.id}`}
      className={`block border rounded-[8px] p-3 transition-all hover:shadow-md ${
        isHighlighted
          ? "border-brand-indigo bg-brand-indigo/5 shadow-sm"
          : "border-[#EEEEEE] bg-white hover:border-brand-indigo/30"
      }`}>
      <div className="flex items-start gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isHighlighted ? "bg-brand-indigo/10" : "bg-[#F8F9FA]"}`}>
          {REL_ICON[member.relationship] ?? <User size={13} className="text-brand-text-muted" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-brand-text-heading text-xs truncate">
            {member.firstName} {member.lastName}
          </p>
          <p className="text-[10px] font-mono text-brand-indigo mt-0.5">{member.memberNumber}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[member.status] ?? "bg-[#6C757D]"}`} />
            <span className="text-[10px] text-brand-text-muted capitalize">{member.relationship.toLowerCase()}</span>
            {member.dateOfBirth && (
              <span className="text-[10px] text-brand-text-muted">· {age(member.dateOfBirth)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export function FamilyTreeView({ principal, dependants, highlightId }: Props) {
  const total = 1 + dependants.length;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-brand-indigo" />
        <h3 className="font-semibold text-brand-text-heading text-sm">Family Unit</h3>
        <span className="text-[11px] text-brand-text-muted ml-auto">{total} member{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Principal */}
      <MemberCard member={principal} isHighlighted={highlightId === principal.id} />

      {/* Tree connector + dependants */}
      {dependants.length > 0 && (
        <div className="pl-4 border-l-2 border-[#EEEEEE] ml-3 space-y-2">
          {dependants.map((dep) => (
            <MemberCard key={dep.id} member={dep} isHighlighted={highlightId === dep.id} />
          ))}
        </div>
      )}

      {dependants.length === 0 && (
        <p className="text-xs text-brand-text-muted pl-1">No dependants on this membership.</p>
      )}
    </div>
  );
}
