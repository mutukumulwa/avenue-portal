export default function RenewalWorkspaceLoading() {
  return (
    <div className="space-y-6 font-ui">
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-[#E6E7E8]" />
        <div className="h-8 w-80 animate-pulse rounded bg-[#E6E7E8]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[#E6E7E8]" />
      </div>

      <div className="flex flex-wrap gap-2">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-10 w-40 animate-pulse rounded-[8px] bg-[#E6E7E8]" />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded bg-[#E6E7E8]" />
            <div className="mt-3 h-7 w-24 animate-pulse rounded bg-[#E6E7E8]" />
            <div className="mt-3 h-3 w-32 animate-pulse rounded bg-[#E6E7E8]" />
          </div>
        ))}
      </div>

      <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-[#E6E7E8]" />
        <div className="mt-5 grid gap-4 xl:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="h-10 animate-pulse rounded-[8px] bg-[#E6E7E8]" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-[8px] bg-[#E6E7E8]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
