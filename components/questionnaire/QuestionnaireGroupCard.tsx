'use client';

export function QuestionnaireGroupCard({ title, children }: { title: string; children: React.ReactNode }) {
  const hasTitle = title.trim().length > 0;

  if (!hasTitle) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="space-y-5 border-l-2 border-[#0B1F45] pl-4 md:space-y-8">{children}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-5">
        <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0B1F45]">{title}</h3>
        <div className="mt-2 h-0.5 w-full bg-[#C8973A]" aria-hidden />
      </div>
      <div className="space-y-5 border-l-2 border-[#0B1F45] pl-4 md:space-y-8">{children}</div>
    </div>
  );
}
