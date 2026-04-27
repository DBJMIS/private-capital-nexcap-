'use client';

import { useRouter } from 'next/navigation';

import { AssignCfpMenu, type ActiveCfpOption } from '@/components/fund-applications/AssignCfpMenu';

type Props = {
  applicationId: string;
  activeCfps: ActiveCfpOption[];
};

export function AssignCfpWithRefresh({ applicationId, activeCfps }: Props) {
  const router = useRouter();
  return (
    <AssignCfpMenu
      applicationId={applicationId}
      activeCfps={activeCfps}
      onLinked={() => {
        router.refresh();
      }}
    />
  );
}
