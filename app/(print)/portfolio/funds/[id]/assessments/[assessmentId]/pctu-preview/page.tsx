import { existsSync } from 'node:fs';
import path from 'node:path';
import { notFound } from 'next/navigation';

import { PctuReportTemplate } from '@/components/portfolio/PctuReportTemplate';
import { assemblePctuReportData } from '@/lib/portfolio/pctu-report-data';
import { getProfile, requireAuth } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export default async function PctuPreviewPage({
  params,
}: {
  params: Promise<{ id: string; assessmentId: string }>;
}) {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || !can(profile, 'read:tenant')) {
    return <p className="p-6 text-sm text-red-700">Forbidden</p>;
  }

  const { id: fundId, assessmentId } = await params;
  let data;
  try {
    data = await assemblePctuReportData(profile.tenant_id, fundId, assessmentId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unable to load report';
    if (msg.includes('approved')) {
      return <p className="p-6 text-sm text-gray-700">{msg}</p>;
    }
    notFound();
  }

  const logoPath = path.join(process.cwd(), 'public', 'branding', 'dbj-logo.svg');
  const showLogo = existsSync(logoPath);

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <div
        className="mx-auto bg-white shadow-lg print:shadow-none"
        style={{ width: '210mm' }}
      >
        <PctuReportTemplate data={data} showLogo={showLogo} />
      </div>
    </div>
  );
}
