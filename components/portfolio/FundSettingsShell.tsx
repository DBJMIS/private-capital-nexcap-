'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { FundPctuProfileEditor } from '@/components/portfolio/FundPctuProfileEditor';
import { FundSettingsTab, FUND_SETTINGS_NAV_ITEMS, FUND_SETTINGS_SECTION_IDS } from '@/components/portfolio/FundSettingsTab';
import type { PortfolioFundRow } from '@/lib/portfolio/types';
import type { Json } from '@/types/database';
import { cn } from '@/lib/utils';

export type PctuNavKey =
  | 'pctu-fund-profile'
  | 'pctu-principals'
  | 'pctu-directors'
  | 'pctu-investment-committee'
  | 'pctu-management-team'
  | 'pctu-esg-notes';

const PCTU_NAV: { key: PctuNavKey; id: string; label: string }[] = [
  { key: 'pctu-fund-profile', id: 'pctu-section-fund-profile', label: 'Fund profile' },
  { key: 'pctu-principals', id: 'pctu-section-principals', label: 'Principals' },
  { key: 'pctu-directors', id: 'pctu-section-directors', label: 'Directors' },
  { key: 'pctu-investment-committee', id: 'pctu-section-investment-committee', label: 'Investment committee' },
  { key: 'pctu-management-team', id: 'pctu-section-management-team', label: 'Management team' },
  { key: 'pctu-esg-notes', id: 'pctu-section-esg-notes', label: 'ESG notes' },
];

export type CombinedNavKey = keyof typeof FUND_SETTINGS_SECTION_IDS | PctuNavKey;

function navSectionId(key: CombinedNavKey): string {
  if (key === 'identity' || key === 'commitment' || key === 'cadence' || key === 'contacts') {
    return FUND_SETTINGS_SECTION_IDS[key];
  }
  return PCTU_NAV.find((p) => p.key === key)?.id ?? '';
}

function allObserveIds(): string[] {
  const settingsIds = Object.values(FUND_SETTINGS_SECTION_IDS);
  const pctuIds = PCTU_NAV.map((p) => p.id);
  return [...settingsIds, ...pctuIds];
}

function navKeyFromElementId(id: string): CombinedNavKey | null {
  const sk = (Object.keys(FUND_SETTINGS_SECTION_IDS) as (keyof typeof FUND_SETTINGS_SECTION_IDS)[]).find(
    (k) => FUND_SETTINGS_SECTION_IDS[k] === id,
  );
  if (sk) return sk;
  const pk = PCTU_NAV.find((p) => p.id === id);
  return pk ? pk.key : null;
}

function CombinedSectionNav({
  active,
  onNavigate,
  className,
}: {
  active: CombinedNavKey;
  onNavigate: (key: CombinedNavKey) => void;
  className?: string;
}) {
  const NavButton = ({ navKey, label }: { navKey: CombinedNavKey; label: string }) => {
    const isActive = active === navKey;
    return (
      <button
        type="button"
        onClick={() => onNavigate(navKey)}
        className={cn(
          'w-full border-l-2 py-2 pl-3 text-left text-sm text-gray-500 transition-colors hover:text-[#0B1F45]',
          isActive
            ? 'border-[#0B1F45] bg-[#EEF2F7] font-medium text-[#0B1F45] rounded-r-md'
            : 'border-transparent',
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <nav className={cn('space-y-0.5', className)} aria-label="On this page">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">On this page</p>
      <ul className="space-y-0.5">
        {FUND_SETTINGS_NAV_ITEMS.map(({ key, label }) => (
          <li key={key}>
            <NavButton navKey={key} label={label} />
          </li>
        ))}
      </ul>

      <div className="my-3 h-px bg-gray-100" />
      <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">PCTU Profile</div>
      <ul className="space-y-0.5">
        {PCTU_NAV.map(({ key, label }) => (
          <li key={key}>
            <NavButton navKey={key} label={label} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function FundSettingsShell({
  fund,
  saveSettings,
  busy,
  pctuProfileRaw,
  onPctuSaved,
}: {
  fund: PortfolioFundRow;
  saveSettings: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  busy: boolean;
  pctuProfileRaw: Json | null;
  onPctuSaved?: () => void;
}) {
  const [activeSection, setActiveSection] = useState<CombinedNavKey>('identity');

  const observeIds = useMemo(() => allObserveIds(), []);

  useEffect(() => {
    const els = observeIds.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0].target.id;
        const key = navKeyFromElementId(id);
        if (key) setActiveSection(key);
      },
      { root: null, rootMargin: '-96px 0px -45% 0px', threshold: [0, 0.1, 0.25] },
    );

    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, [observeIds, fund.updated_at]);

  const scrollToSection = useCallback((key: CombinedNavKey) => {
    const id = navSectionId(key);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr] lg:gap-6">
      <aside className="hidden lg:block">
        <div className="sticky top-4">
          <CombinedSectionNav active={activeSection} onNavigate={scrollToSection} />
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="lg:hidden">
          <CombinedSectionNav
            active={activeSection}
            onNavigate={scrollToSection}
            className="rounded-lg border border-gray-200 bg-white p-3"
          />
        </div>

        <FundSettingsTab fund={fund} saveSettings={saveSettings} busy={busy} />

        <div className="flex flex-col items-center gap-1 py-2">
          <div className="flex w-full items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              PCTU Report Profile
            </span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <p className="-mt-1 mb-2 text-center text-xs text-gray-400">Powers the PCTU quarterly report PDF</p>
        </div>

        <FundPctuProfileEditor
          fundId={fund.id}
          pctuProfileRaw={pctuProfileRaw}
          resetKey={fund.updated_at}
          onSaved={onPctuSaved}
        />
      </div>
    </div>
  );
}
