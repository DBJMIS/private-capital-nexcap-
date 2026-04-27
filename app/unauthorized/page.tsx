import Link from 'next/link';
import { ShieldX } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** Public route — no `(auth)` layout; users may land here without a full session. */
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3F4F6] px-6 py-16">
      <ShieldX className="h-16 w-16 text-red-600" aria-hidden />
      <h1 className="mt-6 text-2xl font-bold text-[#0B1F45]">Access Restricted</h1>
      <p className="mt-2 max-w-md text-center text-gray-500">You don&apos;t have permission to view this page.</p>
      <p className="mt-1 max-w-md text-center text-sm text-gray-400">
        Contact your IT Administrator to request access.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90">
          <Link href="/">Go to Home</Link>
        </Button>
        <Button asChild variant="outline">
          <a href="/api/auth/signout">Sign Out</a>
        </Button>
      </div>
    </div>
  );
}
