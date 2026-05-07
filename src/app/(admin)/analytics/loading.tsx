function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#E6E7E8] ${className}`} />;
}

export default function StrategicPurchasingAnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-4 w-44" />
        <Block className="h-9 w-80" />
        <Block className="h-4 w-96" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <Block className="mb-3 h-3 w-32" />
            <Block className="h-8 w-24" />
            <Block className="mt-3 h-3 w-40" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm xl:col-span-2">
          <div className="border-b border-[#EEEEEE] px-5 py-4">
            <Block className="mb-2 h-5 w-48" />
            <Block className="h-4 w-72" />
          </div>
          <div className="space-y-0 divide-y divide-[#EEEEEE]">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-6 gap-4 px-5 py-4">
                <Block className="h-5 w-full" />
                <Block className="h-5 w-16" />
                <Block className="h-5 w-24" />
                <Block className="h-5 w-24" />
                <Block className="h-5 w-16" />
                <Block className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <Block className="mb-5 h-5 w-44" />
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="mb-4">
                <div className="mb-2 flex justify-between">
                  <Block className="h-4 w-24" />
                  <Block className="h-4 w-16" />
                </div>
                <Block className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
          <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <Block className="mb-3 h-5 w-36" />
            <Block className="h-16 w-full" />
          </div>
        </div>
      </div>

      <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
        <div className="border-b border-[#EEEEEE] px-5 py-4">
          <Block className="mb-2 h-5 w-44" />
          <Block className="h-4 w-72" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-[#EEEEEE] px-5 py-4 last:border-b-0">
            <Block className="h-8 w-8" />
            <div>
              <Block className="mb-2 h-4 w-56" />
              <Block className="h-3 w-44" />
            </div>
            <Block className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
