import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { getServerSession } from 'next-auth';

import { AuthSessionProvider } from '@/components/auth/AuthSessionProvider';
import { authOptions } from '@/lib/auth-options';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'DBJ VC Management Platform',
    template: '%s · DBJ VC',
  },
  description: 'Development Bank of Jamaica — Private Capital & Fund Management',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans antialiased">
        <AuthSessionProvider session={session}>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
