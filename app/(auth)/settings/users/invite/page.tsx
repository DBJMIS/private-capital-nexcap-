'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronLeft, Info } from 'lucide-react';

import { AccessPreviewBlock, RoleCardGrid } from '@/components/settings/RoleAccessBlocks';
import type { AssignableInviteRole } from '@/lib/auth/rbac';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function InviteUserPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableInviteRole | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const validEmail = useMemo(() => EMAIL_RE.test(email.trim()), [email]);
  const canSubmit = fullName.trim().length > 0 && validEmail && role;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !role) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/settings/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          role,
          note: note.trim() || null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: unknown; email?: string };
      if (!res.ok) {
        const msg = typeof j.error === 'string' ? j.error : 'Invitation failed';
        setErr(msg);
        return;
      }
      router.push(`/settings/users?invited=${encodeURIComponent(email.trim().toLowerCase())}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <Link
        href="/settings/users"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0B1F45]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        User Management
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-[#0B1F45]">Invite External User</h1>
        <p className="mt-1 text-sm text-gray-400">
          For users outside of DBJ&apos;s Azure AD directory. Internal staff can be added directly using Add Internal
          User.
        </p>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {err}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <Info className="mt-0.5 h-4 w-4 text-blue-600" aria-hidden />
          <p className="text-xs text-blue-700">
            This invitation flow is for external users such as fund managers or consultants who do not have a DBJ
            Microsoft account. For DBJ staff, use Add Internal User instead.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <Label htmlFor="full_name">Full Name *</Label>
            <Input id="full_name" className="mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              type="email"
              className="mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {email && !validEmail ? <p className="mt-1 text-xs text-red-600">Enter a valid email address.</p> : null}
          </div>
        </div>

        <div className="mt-8">
          <p className="text-sm font-medium text-gray-700">Select Role</p>
          <div className="mt-3">
            <RoleCardGrid selected={role} onSelect={setRole} />
          </div>
          <AccessPreviewBlock role={role} />
        </div>

        <div className="mt-8">
          <Label htmlFor="note">Personal note (optional)</Label>
          <Textarea
            id="note"
            rows={3}
            className="mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a personal message to the invitation email (optional)"
          />
          <p className="mt-1 text-xs text-gray-400">This note is included at the bottom of the invitation email.</p>
        </div>

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/settings/users')}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-[#0B1F45] text-white hover:bg-[#0B1F45]/90"
            disabled={!canSubmit || busy}
          >
            Send Invitation
          </Button>
        </div>
      </form>
    </div>
  );
}
