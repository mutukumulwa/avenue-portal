"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";
import { MapPin, Phone, Navigation } from "lucide-react";
import { getNearbyProvidersAction } from "./actions";

const MemberMap = dynamic(() => import("./MemberMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-100 animate-pulse rounded-lg flex items-center justify-center text-slate-400">Loading interactive map...</div>,
});

export function FacilitiesMap() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState(20);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          console.error("Geolocation error:", err);
          // Default to Nairobi if user denies permission
          setPosition({ lat: -1.2921, lng: 36.8219 });
        }
      );
    } else {
      setPosition({ lat: -1.2921, lng: 36.8219 });
    }
  }, []);

  useEffect(() => {
    if (position) {
      setLoading(true);
      getNearbyProvidersAction(position.lat, position.lng, radius).then((data) => {
        setProviders(data);
        setLoading(false);
      });
    }
  }, [position, radius]);

  if (!position) return <div className="h-96 bg-slate-100 animate-pulse rounded-lg flex items-center justify-center">Locating you...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-[#EEEEEE]">
        <h2 className="font-bold text-avenue-text-heading">Nearby Facilities (Within {radius}km)</h2>
        <select 
          value={radius} 
          onChange={(e) => setRadius(Number(e.target.value))}
          className="border border-[#EEEEEE] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-avenue-indigo"
        >
          <option value={5}>5 km</option>
          <option value={10}>10 km</option>
          <option value={20}>20 km</option>
          <option value={50}>50 km</option>
          <option value={100}>100 km</option>
        </select>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[500px] border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
          <MemberMap position={position} providers={providers} />
        </div>

        <div className="space-y-3 h-[500px] overflow-y-auto pr-2">
          {loading ? (
            <div className="text-center py-10 text-avenue-text-muted">Searching...</div>
          ) : providers.length === 0 ? (
            <div className="text-center py-10 text-avenue-text-muted bg-white rounded-lg border border-[#EEEEEE]">
              No facilities found within {radius}km.
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm hover:border-avenue-indigo transition-colors cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-avenue-text-heading">{p.name}</p>
                    <p className="text-[10px] uppercase font-bold text-avenue-indigo">{p.type} • {Number(p.distance).toFixed(1)} km away</p>
                  </div>
                </div>
                {p.address && (
                  <div className="flex items-start gap-1.5 text-xs text-avenue-text-muted mt-2">
                    <MapPin size={12} className="mt-0.5 flex-shrink-0" />
                    <span>{p.address}</span>
                  </div>
                )}
                {p.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-avenue-text-muted mt-1">
                    <Phone size={12} className="flex-shrink-0" />
                    <a href={`tel:${p.phone}`} className="hover:text-avenue-indigo">{p.phone}</a>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-[#EEEEEE]">
                  <a 
                    href={`https://www.google.com/maps/dir/?api=1&destination=${p.geoLatitude},${p.geoLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-slate-50 hover:bg-avenue-indigo hover:text-white text-avenue-text-heading px-3 py-1.5 rounded text-xs font-bold transition-colors"
                  >
                    <Navigation size={14} />
                    Navigate Here
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
