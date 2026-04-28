/** Instant loading UI for admin/portfolio routes (no data dependency). */
export default function DataShellSkeleton() {
  return (
    <div className="px-6 py-6 animate-pulse">
      <div className="mb-2 h-8 w-64 rounded-lg bg-gray-200" />
      <div className="mb-6 h-4 w-48 rounded bg-gray-100" />

      <div className="mb-6 grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-3 h-3 w-20 rounded bg-gray-200" />
            <div className="mb-2 h-8 w-16 rounded bg-gray-200" />
            <div className="h-3 w-24 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="h-12 border-b border-gray-200 bg-gray-50" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-gray-100 px-4 py-4">
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="ml-auto h-4 w-20 rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
