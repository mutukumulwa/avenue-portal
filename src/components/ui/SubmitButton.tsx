"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import React from "react";

export function SubmitButton({ 
  children, 
  icon,
  className 
}: { 
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button 
      type="submit"
      disabled={pending}
      className={className || "bg-[#0B1437] hover:bg-[#142150] disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-full font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 shadow-sm"}
    >
      {pending ? <Loader2 size={18} className="animate-spin" /> : icon}
      <span>{pending ? "Processing..." : children}</span>
    </button>
  );
}
