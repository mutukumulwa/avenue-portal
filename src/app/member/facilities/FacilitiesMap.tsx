"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { BadgeCheck, CircleDollarSign, MapPin, Navigation, Phone, SlidersHorizontal } from "lucide-react";
import { getNearbyProvidersAction } from "./actions";
import type { ProviderLocation } from "./MemberMap";

const PROCEDURES = [
  { label: "General consultation", cptCode: "99213", serviceHint: "Outpatient" },
  { label: "Specialist consultation", cptCode: "99214", serviceHint: "Outpatient" },
  { label: "Full blood count", cptCode: "85025", serviceHint: "Laboratory" },
  { label: "Chest X-ray", cptCode: "71046", serviceHint: "Imaging" },
  { label: "Abdominal ultrasound", cptCode: "76700", serviceHint: "Imaging" },
  { label: "Caesarean section", cptCode: "59510", serviceHint: "Maternity" },
  { label: "Eye examination", cptCode: "92004", serviceHint: "Optical" },
];

const MemberMap = dynamic(() => import("./MemberMap"), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center rounded-[8px] bg-slate-100 text-slate-400">Loading interactive map...</div>,
});

function formatMoney(value: number) {
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  return `KES ${Math.round(value).toLocaleString("en-UG")}`;
}

function tierLabel(tier: string) {
  if (tier === "OWN") return "Medvex facility";
  if (tier === "PARTNER") return "Partner facility";
  return "Panel facility";
}

export function FacilitiesMap() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [providers, setProviders] = useState<ProviderLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [radius, setRadius] = useState(20);
  const [procedureCode, setProcedureCode] = useState("99213");
  const [providerTier, setProviderTier] = useState<"ALL" | "OWN" | "PARTNER" | "PANEL">("ALL");
  const procedure = PROCEDURES.find((item) => item.cptCode === procedureCode) ?? PROCEDURES[0];

  useEffect(() => {
    let mounted = true;
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mounted) setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          if (mounted) setPosition({ lat: -1.2921, lng: 36.8219 });
        },
      );
    } else {
      setTimeout(() => {
        if (mounted) setPosition({ lat: -1.2921, lng: 36.8219 });
      }, 0);
    }
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (position) {
      const fetchProviders = async () => {
        setLoading(true);
        const data = await getNearbyProvidersAction(position.lat, position.lng, radius, procedureCode, providerTier, procedure.serviceHint);
        if (mounted) {
          setProviders(data);
          setLoading(false);
        }
      };
      fetchProviders();
    }
    return () => { mounted = false; };
  }, [position, radius, procedureCode, providerTier, procedure.serviceHint]);

  if (!position) {
    return <div className="flex h-96 items-center justify-center rounded-[8px] bg-slate-100 text-brand-text-muted">Locating you...</div>;
  }

  return (
    <div className="space-y-4 font-ui">
      <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-brand-indigo" />
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Find care with cost preview</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[13px] font-bold uppercase text-brand-text-muted">Procedure</span>
            <select
              value={procedureCode}
              onChange={(event) => setProcedureCode(event.target.value)}
              className="w-full rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo"
            >
              {PROCEDURES.map((item) => (
                <option key={item.cptCode} value={item.cptCode}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[13px] font-bold uppercase text-brand-text-muted">Facility type</span>
            <select
              value={providerTier}
              onChange={(event) => setProviderTier(event.target.value as typeof providerTier)}
              className="w-full rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo"
            >
              <option value="ALL">All active facilities</option>
              <option value="OWN">Medvex facilities</option>
              <option value="PARTNER">Partner facilities</option>
              <option value="PANEL">Panel facilities</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[13px] font-bold uppercase text-brand-text-muted">Distance</span>
            <select
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
              className="w-full rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-sm outline-none focus:border-brand-indigo"
            >
              <option value={5}>Within 5 km</option>
              <option value={10}>Within 10 km</option>
              <option value={20}>Within 20 km</option>
              <option value={50}>Within 50 km</option>
              <option value={100}>Within 100 km</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-[520px] overflow-hidden rounded-[8px] border border-[#EEEEEE] shadow-sm lg:col-span-2">
          <MemberMap position={position} providers={providers} />
        </div>

        <div className="h-[520px] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <div className="rounded-[8px] border border-[#EEEEEE] bg-white py-10 text-center text-brand-text-muted">Searching...</div>
          ) : providers.length === 0 ? (
            <div className="rounded-[8px] border border-[#EEEEEE] bg-white py-10 text-center text-brand-text-muted">
              No facilities found within {radius} km for {procedure.label.toLowerCase()}.
            </div>
          ) : (
            providers.map((provider) => (
              <div key={provider.id} className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm transition-colors hover:border-brand-indigo/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-brand-text-heading">{provider.name}</p>
                    <p className="mt-1 text-[13px] font-semibold text-brand-indigo">
                      {tierLabel(provider.tier)} - {provider.type.replace(/_/g, " ")} - {Number(provider.distance).toFixed(1)} km
                    </p>
                  </div>
                  {provider.estimate?.confidence === "TARIFF" && <BadgeCheck className="h-5 w-5 shrink-0 text-[#28A745]" />}
                </div>

                {provider.estimate && (
                  <div className="mt-4 rounded-[8px] bg-[#F8F9FA] p-3">
                    <div className="flex items-center gap-2">
                      <CircleDollarSign className="h-4 w-4 text-brand-indigo" />
                      <p className="text-[13px] font-bold uppercase text-brand-text-muted">Estimated cost</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <p className="text-[13px] text-brand-text-muted">Total</p>
                        <p className="font-bold tabular-nums text-brand-text-heading">{formatMoney(provider.estimate.estimatedCost)}</p>
                      </div>
                      <div>
                        <p className="text-[13px] text-brand-text-muted">Plan</p>
                        <p className="font-bold tabular-nums text-[#28A745]">{formatMoney(provider.estimate.planCovers)}</p>
                      </div>
                      <div>
                        <p className="text-[13px] text-brand-text-muted">You</p>
                        <p className="font-bold tabular-nums text-[#856404]">{formatMoney(provider.estimate.estimatedMemberShare)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-[12px] leading-snug text-brand-text-muted">{provider.estimate.explanation}</p>
                  </div>
                )}

                {provider.address && (
                  <div className="mt-3 flex items-start gap-1.5 text-[13px] text-brand-text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{provider.address}</span>
                  </div>
                )}
                {provider.phone && (
                  <div className="mt-1 flex items-center gap-1.5 text-[13px] text-brand-text-muted">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <a href={`tel:${provider.phone}`} className="hover:text-brand-indigo">{provider.phone}</a>
                  </div>
                )}
                <div className="mt-3 border-t border-[#EEEEEE] pt-3">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${provider.geoLatitude},${provider.geoLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-slate-50 px-3 py-2 text-sm font-bold text-brand-text-heading transition-colors hover:bg-brand-indigo hover:text-white"
                  >
                    <Navigation className="h-4 w-4" />
                    Navigate
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
