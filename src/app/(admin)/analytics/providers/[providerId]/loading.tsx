export default function ProviderAnalyticsDetailLoading() {
  return (
    <div className="space-y-6 font-ui animate-pulse">
      <div className="h-7 w-48 rounded-[6px] bg-[#EEEEEE]" />
      <div className="h-10 w-96 rounded-[8px] bg-[#EEEEEE]" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm space-y-2">
            <div className="h-3 w-24 rounded bg-[#EEEEEE]" />
            <div className="h-7 w-32 rounded bg-[#EEEEEE]" />
            <div className="h-3 w-40 rounded bg-[#EEEEEE]" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm h-64" />
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm h-64" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm h-48" />
        ))}
      </div>
    </div>
  );
}
