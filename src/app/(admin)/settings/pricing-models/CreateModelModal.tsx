"use client";

import { useState } from "react";
import { PlusCircle, X } from "lucide-react";
import { createPricingModelAction } from "./actions";

export function CreateModelModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setOpen(true)}
        className="bg-avenue-indigo text-white px-4 py-2 rounded font-bold hover:bg-avenue-indigo/90 flex items-center gap-2 text-sm transition-colors"
      >
        <PlusCircle size={16} />
        Create Model
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[#EEEEEE] bg-[#F8F9FA]">
              <h2 className="font-bold text-avenue-text-heading">Create Pricing Model</h2>
              <button onClick={() => setOpen(false)} className="text-avenue-text-muted hover:text-avenue-text-heading">
                <X size={20} />
              </button>
            </div>
            
            <form action={createPricingModelAction} className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-avenue-text-muted uppercase">Model Name</label>
                <input 
                  name="name" 
                  type="text" 
                  required 
                  placeholder="e.g. 2025 Age Banded Rates"
                  className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-avenue-text-muted uppercase">Type</label>
                <select 
                  name="type" 
                  required
                  className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo bg-white"
                >
                  <option value="FLAT_RATE">Flat Rate</option>
                  <option value="AGE_BANDED">Age Banded</option>
                  <option value="EXPERIENCE_RATED">Experience Rated</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-avenue-text-muted uppercase">Description (Optional)</label>
                <textarea 
                  name="description" 
                  rows={3}
                  className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm font-semibold border border-[#EEEEEE] rounded-md hover:bg-[#F8F9FA] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-avenue-indigo text-white px-5 py-2 rounded-md font-bold hover:bg-avenue-indigo/90 transition-colors text-sm"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
