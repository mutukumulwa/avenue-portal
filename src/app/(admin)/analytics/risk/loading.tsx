export default function MemberRiskWorkbenchLoading() {
  return (
    <div className="space-y-6 font-ui">
      <div className="space-y-3">
        <div className="h-4 w-32 animate-pulse rounded bg-[#E6E7E8]" />
        <div className="h-8 w-80 animate-pulse rounded bg-[#E6E7E8]" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-[#E6E7E8]" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
            <div className="h-3 w-28 animate-pulse rounded bg-[#E6E7E8]" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-[#E6E7E8]" />
            <div className="mt-3 h-3 w-32 animate-pulse rounded bg-[#E6E7E8]" />
          </div>
        ))}
      </div>

      <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
        <div className="h-4 w-36 animate-pulse rounded bg-[#E6E7E8]" />
        <div className="mt-4 flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-7 w-24 animate-pulse rounded-full bg-[#E6E7E8]" />
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="h-10 animate-pulse rounded-[8px] bg-[#E6E7E8]" />
          ))}
        </div>
      </div>

      <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
        <div className="border-b border-[#EEEEEE] px-5 py-4">
          <div className="h-5 w-40 animate-pulse rounded bg-[#E6E7E8]" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-[#E6E7E8]" />
        </div>
        <div className="divide-y divide-[#EEEEEE]">
          {[0, 1, 2].map((item) => (
            <div key={item} className="grid gap-4 px-5 py-5 lg:grid-cols-[1.4fr_1fr_220px]">
              <div>
                <div className="mb-3 flex gap-2">
                  <div className="h-6 w-20 animate-pulse rounded-full bg-[#E6E7E8]" />
                  <div className="h-6 w-28 animate-pulse rounded-full bg-[#E6E7E8]" />
                </div>
                <div className="h-5 w-72 animate-pulse rounded bg-[#E6E7E8]" />
                <div className="mt-2 h-4 w-full max-w-lg animate-pulse rounded bg-[#E6E7E8]" />
              </div>
              <div className="space-y-3">
                <div className="h-4 w-36 animate-pulse rounded bg-[#E6E7E8]" />
                <div className="h-2 w-full animate-pulse rounded bg-[#E6E7E8]" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-10 animate-pulse rounded bg-[#E6E7E8]" />
                  <div className="h-10 animate-pulse rounded bg-[#E6E7E8]" />
                </div>
              </div>
              <div className="h-28 animate-pulse rounded-[8px] bg-[#E6E7E8]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
