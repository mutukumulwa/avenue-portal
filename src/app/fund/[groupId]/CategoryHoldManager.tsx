"use client";

import { useTransition } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { toggleCategoryHoldAction } from "./actions";

const ALL_CATEGORIES = [
  "INPATIENT","OUTPATIENT","MATERNITY","DENTAL","OPTICAL",
  "MENTAL_HEALTH","CHRONIC_DISEASE","SURGICAL","AMBULANCE_EMERGENCY",
  "REHABILITATION","WELLNESS_PREVENTIVE",
];

interface Props {
  groupId: string;
  heldCategories: string[];
}

export function CategoryHoldManager({ groupId, heldCategories }: Props) {
  const [isPending, start] = useTransition();

  function toggle(category: string) {
    const fd = new FormData();
    fd.set("groupId", groupId);
    fd.set("category", category);
    start(async () => { await toggleCategoryHoldAction(fd); });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_CATEGORIES.map(cat => {
        const isHeld = heldCategories.includes(cat);
        return (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            disabled={isPending}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors disabled:opacity-50 ${
              isHeld
                ? "bg-[#DC3545]/10 text-[#DC3545] border-[#DC3545]/30 hover:bg-[#DC3545]/20"
                : "bg-[#F8F9FA] text-avenue-text-muted border-[#EEEEEE] hover:bg-[#EEEEEE]"
            }`}
          >
            {isHeld ? <PauseCircle size={12} /> : <PlayCircle size={12} />}
            {cat.replace(/_/g, " ")}
          </button>
        );
      })}
    </div>
  );
}
