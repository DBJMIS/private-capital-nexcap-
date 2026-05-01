import { useCallback, useEffect, useRef, useState } from 'react';

export type FundManagerLinkedRow = {
  id: string;
  name: string;
  firm_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  first_contact_date: string | null;
  created_at: string;
};

export type RelationshipProfileContent = {
  summary: string;
  strengths: string[];
  concerns: string[];
  interaction_timeline: Array<{ date: string; event: string; outcome: string }>;
  dd_history: {
    submissions: number;
    avg_score: number;
    highest_score: number;
    sections_consistently_weak: string[];
  };
  relationship_health: 'STRONG' | 'DEVELOPING' | 'STRAINED' | 'INACTIVE' | string;
  recommended_next_steps: string[];
  data_gaps: string[];
  last_updated: string;
};

export type FundManagerNoteVm = {
  id: string;
  note: string;
  added_by: string | null;
  author_name: string;
  created_at: string;
};

export type ProfileRecordVm = {
  generated_at: string;
  version: number;
  profile: Partial<RelationshipProfileContent> | null;
} | null;

type ApiOk = {
  linked: true;
  fund_manager_id: string;
  manager: FundManagerLinkedRow;
  profile_record: {
    generated_at: string;
    version: number;
    profile: Partial<RelationshipProfileContent> | null;
  } | null;
  notes: FundManagerNoteVm[];
  last_contact: string | null;
};

type ApiUnlinked = {
  linked: false;
  fund_manager_id: null;
  manager: null;
  profile_record: null;
  notes: FundManagerNoteVm[];
  last_contact: null;
};

type ApiResponse = ApiOk | ApiUnlinked;

/** Primary hook contract for fund-scoped manager + AI relationship intelligence. */
export type UseFundManagerResult = {
  manager: FundManagerLinkedRow | null;
  profile: Partial<RelationshipProfileContent> | null;
  isLoading: boolean;
  error: string | null;
  regenerate: (managerIdOverride?: string) => Promise<void>;
  addNote: (note: string) => Promise<void>;
  /** Loaded from GET /api/portfolio/funds/:id/fund-manager (includes profile_record + derived profile). */
  profileRecord: ProfileRecordVm;
  notes: FundManagerNoteVm[];
  lastContact: string | null;
  linked: boolean | null;
  fundManagerId: string | null;
  isRegenerating: boolean;
  reload: () => Promise<string | null>;
};

export function useFundManager(fundId: string): UseFundManagerResult {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [fundManagerId, setFundManagerId] = useState<string | null>(null);
  const [manager, setManager] = useState<FundManagerLinkedRow | null>(null);
  const [profileRecord, setProfileRecord] = useState<ProfileRecordVm>(null);
  const [notes, setNotes] = useState<FundManagerNoteVm[]>([]);
  const [lastContact, setLastContact] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Post–note-insert background refresh timer (notes API kicks off profile regen asynchronously). */
  const profilePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (profilePollRef.current) {
        clearTimeout(profilePollRef.current);
        profilePollRef.current = null;
      }
    };
  }, []);

  const reload = useCallback(async (): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/fund-manager`);
      const json = (await res.json()) as ApiResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to load fund manager');
      if (json.linked) {
        setLinked(true);
        setFundManagerId(json.fund_manager_id);
        setManager(json.manager);
        setProfileRecord(
          json.profile_record
            ? {
                generated_at: json.profile_record.generated_at,
                version: json.profile_record.version,
                profile: json.profile_record.profile ?? null,
              }
            : null,
        );
        setNotes(json.notes ?? []);
        setLastContact(json.last_contact);
        return json.fund_manager_id;
      }
      setLinked(false);
      setFundManagerId(null);
      setManager(null);
      setProfileRecord(null);
      setNotes([]);
      setLastContact(null);
      return null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setLinked(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Calls POST `/api/ai/relationship-profile` with `{ fund_manager_id }`. */
  const regenerate = useCallback(
    async (managerIdOverride?: string) => {
      const id = managerIdOverride ?? fundManagerId;
      if (!id) return;
      setIsRegenerating(true);
      setError(null);
      try {
        const res = await fetch('/api/ai/relationship-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fund_manager_id: id }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Regeneration failed');
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Regeneration failed');
      } finally {
        setIsRegenerating(false);
      }
    },
    [fundManagerId, reload],
  );

  /** Calls POST `/api/ai/relationship-profile/notes`. Server queues profile regen — we poll once for updated AI fields. */
  const addNote = useCallback(
    async (noteText: string) => {
      if (!fundManagerId) throw new Error('No fund manager linked');
      const res = await fetch('/api/ai/relationship-profile/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fund_manager_id: fundManagerId, note: noteText }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to add note');
      await reload();
      if (profilePollRef.current) {
        clearTimeout(profilePollRef.current);
      }
      profilePollRef.current = setTimeout(() => {
        profilePollRef.current = null;
        void reload();
      }, 14000);
    },
    [fundManagerId, reload],
  );

  const profile: Partial<RelationshipProfileContent> | null = profileRecord?.profile ?? null;

  return {
    linked,
    fundManagerId,
    manager,
    profile,
    profileRecord,
    notes,
    lastContact,
    isLoading,
    isRegenerating,
    error,
    reload,
    regenerate,
    addNote,
  };
}
