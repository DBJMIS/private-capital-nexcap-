'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useEffect } from 'react';

import { formatApplicationStatus, formatPortalDate } from '@/lib/portal/format-helpers';
import { cn } from '@/lib/utils';
import type { PortalProfileClientProps } from '@/types/portal-profile';

const TABLER_ICONS_CSS =
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.26.0/dist/tabler-icons.min.css';

function initialsFromFullName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    const w = parts[0]!;
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : `${w[0] ?? '?'}`.toUpperCase();
  }
  const a = parts[0]![0] ?? '';
  const b = parts[1]![0] ?? '';
  return `${a}${b}`.toUpperCase() || '?';
}

function formatTsForPortal(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatPortalDate(iso);
}

function statusBadgeStyle(status: string): CSSProperties {
  if (status === 'committed' || status === 'approved') {
    return { backgroundColor: '#E1F5EE', color: '#085041' };
  }
  if (status === 'rejected') {
    return { backgroundColor: '#FCEBEB', color: '#791F1F' };
  }
  return { backgroundColor: '#F1EFE8', color: '#5F5E5A' };
}

function IdentityField({
  label,
  iconClass,
  value,
  valueClassName,
}: {
  label: string;
  iconClass: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <div className="flex items-start gap-2 text-sm font-medium">
        <i className={iconClass} style={{ fontSize: 14, color: '#9CA3AF', marginTop: 2 }} aria-hidden />
        <span className={cn('min-w-0 flex-1 break-words text-gray-900', valueClassName)}>{value}</span>
      </div>
    </div>
  );
}

function ActivityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <span className="text-[12px] text-gray-500">{label}</span>
      <span className="text-right text-[12px] font-medium text-gray-900">{value}</span>
    </div>
  );
}

export function PortalProfilePageClient({
  tenantName,
  contact,
  profile,
  sessionUser,
  applications,
}: PortalProfileClientProps) {
  useEffect(() => {
    const id = 'tabler-icons-webfont-portal-profile';
    if (typeof document === 'undefined' || document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = TABLER_ICONS_CSS;
    document.head.appendChild(link);
  }, []);

  const displayName = contact?.full_name ?? profile?.full_name ?? sessionUser.full_name;
  const displayEmail = profile?.email ?? sessionUser.email;
  const initials = initialsFromFullName(displayName);

  const fundLabel = applications.length === 1 ? '1 fund' : `${applications.length} funds`;

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header */}
      <div
        className="flex flex-col items-stretch gap-5 rounded-xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center"
      >
        <div
          className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-white"
          style={{
            background: 'linear-gradient(135deg, #0B1F45, #1D9E75)',
            fontSize: 22,
            fontWeight: 600,
          }}
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold" style={{ color: '#111827' }}>
            {displayName}
          </h2>
          <p className="mt-1 text-sm" style={{ color: '#6B7280' }}>
            {displayEmail}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className="inline-flex rounded-full border px-2.5 py-0.5 font-medium"
              style={{
                backgroundColor: '#E6F1FB',
                color: '#185FA5',
                borderColor: '#85B7EB',
                fontSize: 12,
              }}
            >
              Fund Manager
            </span>
            {contact?.is_primary ? (
              <span
                className="inline-flex rounded-full border px-2.5 py-0.5 font-medium"
                style={{
                  backgroundColor: '#E1F5EE',
                  color: '#085041',
                  borderColor: '#5DCAA5',
                  fontSize: 12,
                }}
              >
                Primary Contact
              </span>
            ) : null}
            {contact?.title ? (
              <span
                className="inline-flex rounded-full border px-2.5 py-0.5 font-medium"
                style={{
                  backgroundColor: '#F1EFE8',
                  color: '#5F5E5A',
                  borderColor: '#D3D1C7',
                  fontSize: 12,
                }}
              >
                {contact.title}
              </span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:ml-auto">
          <Link
            href="/portal/forgot-password"
            className="inline-flex items-center justify-center rounded-lg border px-4 py-2 font-medium transition-colors hover:bg-gray-50"
            style={{
              fontSize: 13,
              borderColor: '#1D9E75',
              color: '#1D9E75',
              backgroundColor: 'white',
            }}
          >
            Change password
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-7">
          {/* Identity */}
          <section className="mb-4 rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-400">Identity</h3>
            <div className="grid grid-cols-1 gap-y-5 md:grid-cols-2">
              <IdentityField
                label="Full Name"
                iconClass="ti ti-user"
                value={contact?.full_name ?? profile?.full_name ?? sessionUser.name}
              />
              <div>
                <IdentityField
                  label="Email"
                  iconClass="ti ti-mail"
                  value={profile?.email ?? sessionUser.email}
                />
                <p className="mt-1 pl-[22px] text-xs text-gray-400">Read-only — email cannot be changed here.</p>
              </div>
              <IdentityField
                label="Title / Role"
                iconClass="ti ti-briefcase"
                value={contact?.title ?? 'Fund Manager'}
                valueClassName={contact?.title ? undefined : 'text-gray-500'}
              />
              <IdentityField
                label="Firm"
                iconClass="ti ti-building"
                value={contact?.fund_managers?.firm_name?.trim() ? contact.fund_managers.firm_name : '—'}
              />
              <IdentityField label="Organisation" iconClass="ti ti-building-bank" value={tenantName} />
              <IdentityField
                label="Portal access since"
                iconClass="ti ti-calendar"
                value={contact?.invited_at ? formatTsForPortal(contact.invited_at) : '—'}
              />
            </div>
          </section>

          {/* Funds */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">My Funds</h3>
              <span
                className="inline-flex rounded-full px-2 py-0.5 font-semibold"
                style={{ backgroundColor: '#E1F5EE', color: '#0F6E56', fontSize: 11 }}
              >
                {fundLabel}
              </span>
            </div>
            {applications.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">No funds linked to your account</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {applications.map((app) => (
                  <li key={app.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: '#111827' }}>
                          {app.fund_name}
                        </span>
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                          style={statusBadgeStyle(app.status)}
                        >
                          {formatApplicationStatus(app.status)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: '#9CA3AF' }}>
                        Submitted: {app.submitted_at ? formatTsForPortal(app.submitted_at) : '—'}
                      </p>
                    </div>
                    <Link
                      href={`/portal/funds/${app.id}`}
                      className="shrink-0 text-xs font-medium hover:underline"
                      style={{ color: '#1D9E75' }}
                    >
                      Open →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4 xl:col-span-5">
          {/* Security */}
          <section className="mb-4 rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-gray-400">Security</h3>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                background: '#F9FAFB',
                border: '0.5px solid #E5E7EB',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <i className="ti ti-lock" style={{ fontSize: 16, color: '#6B7280' }} aria-hidden />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>Email and password</div>
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                  Portal account · {profile?.email ?? sessionUser.email}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#374151', marginBottom: 8, fontWeight: 500 }}>Password</div>
              <Link
                href="/portal/forgot-password"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '9px 16px',
                  border: '0.5px solid #D3D1C7',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#374151',
                  textDecoration: 'none',
                  background: 'white',
                }}
              >
                <i className="ti ti-key" style={{ fontSize: 14 }} aria-hidden />
                Change password
              </Link>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, textAlign: 'center' }}>
                A reset link will be sent to your email
              </div>
            </div>
          </section>

          {/* Activity */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">Account Activity</h3>
            <div className="divide-y divide-gray-100">
              <ActivityRow
                label="Last sign-in"
                value={contact?.last_login_at ? formatTsForPortal(contact.last_login_at) : 'Not recorded'}
              />
              <ActivityRow
                label="Account created"
                value={profile?.created_at ? formatTsForPortal(profile.created_at) : '—'}
              />
              <ActivityRow
                label="Invited by DBJ"
                value={contact?.invited_at ? formatTsForPortal(contact.invited_at) : '—'}
              />
              <ActivityRow label="Primary contact" value={contact?.is_primary ? 'Yes' : 'No'} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
