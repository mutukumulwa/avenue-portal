"use client";

import dynamic from "next/dynamic";
const LocationPickerMap = dynamic(() => import("./LocationPickerMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-slate-400">Loading map...</div>,
});

interface LocationPickerProps {
  initialPosition?: { lat: number; lng: number };
  onPositionChange: (position: { lat: number; lng: number }) => void;
  className?: string;
}

export function LocationPicker({ initialPosition, onPositionChange, className = "h-64 w-full" }: LocationPickerProps) {
  return (
    <div className={className}>
      <LocationPickerMap initialPosition={initialPosition} onPositionChange={onPositionChange} />
    </div>
  );
}
