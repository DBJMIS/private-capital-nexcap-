import Link from 'next/link';

export default async function FundDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="w-full space-y-6 rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-[#0B1F45]">Documents</h1>
        <span className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
          Coming Soon
        </span>
        <p className="mt-4 text-sm text-gray-600">Access all DBJ-shared documents and fund files here.</p>
      </div>
      <div className="border-t border-gray-100 pt-6 text-center">
        <Link href={`/portal/funds/${id}`} className="text-sm font-medium text-[#00A99D] hover:underline">
          ← Back to Overview
        </Link>
      </div>
    </div>
  );
}
