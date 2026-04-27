'use client';

import { Check, Shield, TrendingUp, Users, Briefcase, Settings } from 'lucide-react';
import { Layers } from 'lucide-react';

import { ASSIGNABLE_INVITE_ROLES } from '@/lib/auth/rbac';
import { accessPreviewForRole } from '@/lib/settings/role-visual';
import { cn } from '@/lib/utils';

export const INVITE_ROLE_CARD_META: {
  id: (typeof ASSIGNABLE_INVITE_ROLES)[number];
  title: string;
  description: string;
  Icon: typeof Shield;
  activeClass?: string;
}[] = [
  {
    id: 'pctu_officer',
    title: 'PCTU Officer',
    description: 'Portfolio monitoring · Full /portfolio access',
    Icon: Shield,
  },
  {
    id: 'investment_officer',
    title: 'Investment Officer',
    description: 'Pipeline management · Full /pipeline access',
    Icon: TrendingUp,
  },
  {
    id: 'portfolio_manager',
    title: 'Portfolio Manager',
    description: 'Portfolio + selected pipeline access',
    Icon: Layers,
    activeClass: 'border-indigo-300 bg-indigo-50',
  },
  {
    id: 'panel_member',
    title: 'Panel Member',
    description: 'Assessment scoring · Assigned assessments only',
    Icon: Users,
  },
  {
    id: 'it_admin',
    title: 'IT Admin',
    description: 'User management only · No financial data access',
    Icon: Settings,
  },
  {
    id: 'senior_management',
    title: 'Senior Management',
    description: 'Executive dashboard · Read-only /portfolio/executive',
    Icon: Briefcase,
  },
];

export function AccessPreviewBlock({ role }: { role: string | null }) {
  if (!role) return null;
  const lines = accessPreviewForRole(role);
  if (!lines.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Access Summary</p>
      <ul className="space-y-1.5 text-sm">
        {lines.map((line) => (
          <li key={line.text} className="flex items-start gap-2">
            {line.ok ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0F8A6E]" aria-hidden />
            ) : (
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-red-500" aria-hidden>
                ✕
              </span>
            )}
            <span className={line.ok ? 'text-gray-700' : 'text-gray-500'}>{line.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RoleCardGrid({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: (typeof ASSIGNABLE_INVITE_ROLES)[number]) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {INVITE_ROLE_CARD_META.map(({ id, title, description, Icon, activeClass }) => {
        const active = selected === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              'rounded-xl p-4 text-left transition-colors',
              active
                ? cn('border-2 border-[#0B1F45] bg-[#0B1F45]/5', activeClass)
                : 'cursor-pointer border border-gray-200 bg-white hover:border-gray-300',
            )}
          >
            <Icon className="h-8 w-8 text-[#0B1F45]" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-[#0B1F45]">{title}</p>
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          </button>
        );
      })}
    </div>
  );
}

export function roleChangeWarningMessage(prev: string, next: string): string | null {
  const lost: string[] = [];
  if ((prev === 'pctu_officer' || prev === 'admin') && next !== 'pctu_officer' && next !== 'admin') {
    lost.push('Portfolio');
  }
  if (
    (prev === 'investment_officer' || prev === 'portfolio_manager' || prev === 'analyst' || prev === 'officer' || prev === 'admin') &&
    !['investment_officer', 'portfolio_manager', 'analyst', 'officer', 'admin'].includes(next)
  ) {
    lost.push('Pipeline');
  }
  if ((prev === 'it_admin' || prev === 'admin') && next !== 'it_admin' && next !== 'admin') {
    lost.push('User management');
  }
  if (!lost.length) return null;
  return `This will remove access to: ${lost.join(', ')}.`;
}
