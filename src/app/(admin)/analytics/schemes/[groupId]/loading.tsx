function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#E6E7E8] ${className}`} />;
}

export default function SchemeAnalyticsDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-4 w-40" />
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
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm xl:col-span-2">
          <Block className="mb-5 h-5 w-52" />
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="mb-4 grid grid-cols-[64px_1fr_92px] gap-3">
              <Block className="h-4 w-14" />
              <div className="space-y-2">
                <Block className="h-2 w-full" />
                <Block className="h-2 w-10/12" />
              </div>
              <Block className="h-6 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <Block className="mb-4 h-5 w-44" />
          <div className="space-y-3">
            <Block className="h-10 w-full" />
            <Block className="h-10 w-full" />
            <Block className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
