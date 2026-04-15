"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

type MonthlyRow = {
  month: string;
  claims: number;
  billed: number;
  approved: number;
};

function currency(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
}

export function ClaimsTrendChart({ data }: { data: MonthlyRow[] }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5">
      <h2 className="font-bold text-avenue-text-heading font-heading mb-4">Claims Volume — Last 12 Months</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6C757D" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#6C757D" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #EEEEEE", fontSize: 12 }}
            formatter={(v: number) => [v, "Claims"]}
          />
          <Bar dataKey="claims" fill="#292A83" radius={[4, 4, 0, 0]} maxBarSize={40} name="Claims" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PremiumVsClaimsChart({ data }: { data: MonthlyRow[] }) {
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5">
      <h2 className="font-bold text-avenue-text-heading font-heading mb-4">Premium Billed vs Claims Approved (KES)</h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6C757D" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#6C757D" }} axisLine={false} tickLine={false} tickFormatter={currency} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #EEEEEE", fontSize: 12 }}
            formatter={(v: number) => [`KES ${Number(v).toLocaleString()}`, ""]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="billed"   stroke="#292A83" strokeWidth={2} dot={false} name="Billed" />
          <Line type="monotone" dataKey="approved" stroke="#28A745" strokeWidth={2} dot={false} name="Approved" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LossRatioGauge({ lossRatio }: { lossRatio: number }) {
  const pct = Math.min(100, Math.round(lossRatio * 100));
  const color = pct < 60 ? "#28A745" : pct < 80 ? "#FFC107" : "#DC3545";
  const label = pct < 60 ? "Healthy" : pct < 80 ? "Watch" : "High Risk";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 flex flex-col items-center justify-center gap-2">
      <h2 className="font-bold text-avenue-text-heading font-heading self-start">Loss Ratio</h2>
      <div className="relative flex items-center justify-center mt-2">
        <svg width={140} height={80} viewBox="0 0 140 80">
          {/* Background arc */}
          <path d="M10,70 A60,60 0 0,1 130,70" fill="none" stroke="#EEEEEE" strokeWidth={14} strokeLinecap="round" />
          {/* Filled arc — strokeDasharray trick on a 188.5-unit arc (π×60) */}
          <path
            d="M10,70 A60,60 0 0,1 130,70"
            fill="none"
            stroke={color}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 188.5} 188.5`}
          />
        </svg>
        <div className="absolute bottom-0 flex flex-col items-center">
          <span className="text-3xl font-bold" style={{ color }}>{pct}%</span>
          <span className="text-[10px] font-bold uppercase" style={{ color }}>{label}</span>
        </div>
      </div>
      <p className="text-[10px] text-avenue-text-muted text-center mt-1">
        Claims approved ÷ premium billed (all time)
      </p>
    </div>
  );
}
