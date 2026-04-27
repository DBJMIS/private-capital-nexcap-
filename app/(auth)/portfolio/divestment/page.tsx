import { ArrowRightLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function DivestmentPage() {
  return (
    <div className="px-6 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#0B1F45]">Divestment Summary</h1>
        <p className="mt-1 text-sm text-gray-400">
          Track exits and divestment activity across the portfolio
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-24">
        <ArrowRightLeft className="mb-4 h-12 w-12 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Divestment tracking coming soon</p>
        <p className="mt-1 max-w-xs text-center text-xs text-gray-400">
          Record and monitor fund exits, partial divestments, and returns of capital
        </p>
      </div>
    </div>
  );
}
