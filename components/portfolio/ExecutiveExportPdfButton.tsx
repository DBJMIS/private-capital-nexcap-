'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function ExecutiveExportPdfButton() {
  return (
    <Button
      type="button"
      className="no-print bg-[#0B1F45] text-white hover:bg-[#162d5e]"
      onClick={() => window.print()}
    >
      <Printer className="mr-2 h-4 w-4" aria-hidden />
      Export PDF
    </Button>
  );
}
