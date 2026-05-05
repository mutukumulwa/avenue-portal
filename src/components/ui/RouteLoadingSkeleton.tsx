function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[8px] bg-[#E6E7E8] ${className}`} />;
}

export function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-8 w-64" />
        <Block className="h-4 w-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <Block className="mb-3 h-3 w-32" />
            <Block className="h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <Block className="mb-4 h-4 w-40" />
          <Block className="h-52 w-full" />
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm lg:col-span-2">
          <Block className="mb-4 h-4 w-48" />
          <Block className="h-52 w-full" />
        </div>
      </div>
    </div>
  );
}

export function TableLoadingSkeleton() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Block className="h-8 w-56" />
          <Block className="h-4 w-80" />
        </div>
        <Block className="h-10 w-36 rounded-full" />
      </div>
      <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
        <div className="border-b border-[#EEEEEE] bg-[#E6E7E8] px-6 py-4">
          <Block className="h-4 w-full max-w-3xl bg-[#D4D7DA]" />
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-5 gap-4 px-6 py-4">
              <Block className="h-5 w-full" />
              <Block className="h-5 w-full" />
              <Block className="h-5 w-full" />
              <Block className="h-5 w-24" />
              <Block className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailLoadingSkeleton() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <Block className="h-8 w-72" />
        <Block className="h-4 w-96" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm md:col-span-2">
          <Block className="mb-4 h-5 w-48" />
          <div className="space-y-3">
            <Block className="h-4 w-full" />
            <Block className="h-4 w-11/12" />
            <Block className="h-4 w-10/12" />
          </div>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <Block className="mb-4 h-5 w-32" />
          <Block className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
