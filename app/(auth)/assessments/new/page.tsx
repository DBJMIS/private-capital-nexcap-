'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dsCard, dsType } from '@/components/ui/design-system';
import { cn } from '@/lib/utils';

export default function NewAssessmentPage() {
  const router = useRouter();
  const [applicationId, setApplicationId] = useState('');
  const [questionnaireId, setQuestionnaireId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: applicationId.trim(),
          questionnaire_id: questionnaireId.trim(),
        }),
      });
      const j = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Failed');
        return;
      }
      if (j.id) router.push(`/assessments/${j.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-6">
      <div className={cn(dsCard.padded, 'space-y-6')}>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="app">Application ID</Label>
            <Input
              id="app"
              value={applicationId}
              onChange={(e) => setApplicationId(e.target.value)}
              className="font-mono text-xs"
              placeholder="uuid"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qn">Questionnaire ID</Label>
            <Input
              id="qn"
              value={questionnaireId}
              onChange={(e) => setQuestionnaireId(e.target.value)}
              className="font-mono text-xs"
              placeholder="uuid"
            />
          </div>
        </div>
        <p className={dsType.helper}>Staff-only shortcut; prefer creating assessments from the application workflow when available.</p>
        <Button
          type="button"
          className="w-full"
          disabled={busy || !applicationId.trim() || !questionnaireId.trim()}
          onClick={() => void submit()}
        >
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </div>
  );
}
