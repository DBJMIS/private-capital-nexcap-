import type { ReactNode } from 'react';

/**
 * Print / PCTU preview routes: no AuthenticatedShell (sidebar, navbar, user strip).
 * Root app/layout.tsx still supplies <html>, <body>, and AuthSessionProvider.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white [font-family:Georgia,serif] text-gray-900 antialiased">{children}</div>
  );
}
