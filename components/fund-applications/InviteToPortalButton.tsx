'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ContactManagementPanel } from '@/components/fund-managers/ContactManagementPanel';
import { FundManagerAssociateModal } from '@/components/portfolio/FundManagerAssociateModal';
import { Button } from '@/components/ui/button';

export interface InviteToPortalButtonProps {
  applicationId: string;
  fundManagerId: string | null;
  firmName: string;
  /** Portfolio fund row id — required to open Associate Manager linking flow. */
  associateModalFundId?: string | null;
}

export function InviteToPortalButton(props: InviteToPortalButtonProps) {
  const { applicationId, fundManagerId, firmName, associateModalFundId = null } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [associateOpen, setAssociateOpen] = useState(false);

  if (fundManagerId === null || fundManagerId === '') {
    return (
      <div className="flex max-w-md flex-col gap-3 sm:ml-auto sm:items-end">
        <p className="text-sm text-gray-700 sm:text-right">Link a fund manager to this application to manage portal access.</p>
        {associateModalFundId ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-full border-[#00A99D] text-xs text-[#00A99D] hover:bg-[#E6F7F6] sm:w-auto"
              onClick={() => setAssociateOpen(true)}
            >
              Link Fund Manager
            </Button>
            <FundManagerAssociateModal
              open={associateOpen}
              fundId={associateModalFundId}
              onClose={() => setAssociateOpen(false)}
              onLinked={async () => {
                router.refresh();
              }}
            />
          </>
        ) : (
          <p className="text-xs text-gray-400 sm:text-right">
            Link a portfolio fund commitment first — then you can associate a fund manager here, or manage contacts from the fund overview.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button type="button" variant="default" size="sm" onClick={() => setOpen(true)}>
        Manage Portal Access
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close modal"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="portal-access-title"
            aria-modal="true"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="portal-access-title" className="text-lg font-semibold text-[#0B1F45]">
                Portal Access
              </h2>
              <button
                type="button"
                className="rounded-lg p-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="mt-4">
              <ContactManagementPanel fundManagerId={fundManagerId} firmName={firmName} applicationId={applicationId} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
