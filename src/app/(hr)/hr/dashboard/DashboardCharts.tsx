"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type DashboardChartsProps = {
  memberTrendData: { month: string; count: number }[];
  relationshipData: { name: string; value: number }[];
};

const COLORS = ["#292A83", "#435BA1", "#F5C6B6", "#848E9F"];

export function DashboardCharts({ memberTrendData, relationshipData }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      {/* 12 Month Trend */}
      <div className="bg-white p-5 rounded-xl border border-[#EEEEEE] shadow-sm">
        <h3 className="text-sm font-bold text-avenue-text-heading font-heading mb-4">Membership Trend (12 Months)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={memberTrendData}>
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#848E9F" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#848E9F" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip 
                cursor={{ fill: "#F8F9FA" }} 
                contentStyle={{ borderRadius: '8px', border: '1px solid #EEEEEE', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="count" fill="#292A83" radius={[4, 4, 0, 0]} barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Relationship Composition */}
      <div className="bg-white p-5 rounded-xl border border-[#EEEEEE] shadow-sm">
        <h3 className="text-sm font-bold text-avenue-text-heading font-heading mb-4">Membership Composition</h3>
        <div className="h-64 flex flex-col items-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={relationshipData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {relationshipData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #EEEEEE', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap justify-center gap-4 mt-2">
            {relationshipData.map((entry, index) => (
               <div key={entry.name} className="flex items-center text-xs text-avenue-text-muted font-semibold">
                 <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                 <span>{entry.name} ({entry.value})</span>
               </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
