import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export type ConfirmedParticipant = {
  userId: string;
  displayName: string;
  nationality: string;
  languages: string[];
};

type ParticipationRow = {
  user_id: string;
  participant: {
    display_name: string;
    nationality: string;
    languages: string[];
  } | null;
};

type State = {
  isLoading: boolean;
  error: string | null;
  participants: ConfirmedParticipant[];
};

async function fetchConfirmedParticipants(activityId: string): Promise<ConfirmedParticipant[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('user_id, participant:profiles(display_name, nationality, languages)')
    .eq('activity_id', activityId)
    .eq('status', 'confirmed')
    .returns<ParticipationRow[]>();

  if (error) {
    throw error;
  }

  // `participant` peut être `null` si le profil est masqué par un blocage
  // réciproque (RLS `profiles_select_authenticated`) : on filtre ces lignes
  // plutôt que d'afficher une ligne sans identité exploitable.
  return (data ?? [])
    .filter((row): row is ParticipationRow & { participant: NonNullable<ParticipationRow['participant']> } =>
      !!row.participant
    )
    .map((row) => ({
      userId: row.user_id,
      displayName: row.participant.display_name,
      nationality: row.participant.nationality,
      languages: row.participant.languages,
    }));
}

/**
 * Participants confirmés d'une activité (hors organisateur, qui n'a
 * généralement pas de ligne `participations` — voir `useActivityDetail` pour
 * l'organisateur, à combiner côté écran). Réservé à un contexte où l'appelant
 * a déjà accès à cette activité (`enabled`), même si la RLS
 * `participations_select_self_or_owner` filtrerait de toute façon les lignes
 * pour un tiers non concerné.
 */
export function useConfirmedParticipants(activityId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<State>({ isLoading: true, error: null, participants: [] });
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;

    if (!activityId || !enabled) {
      setState({ isLoading: false, error: null, participants: [] });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchConfirmedParticipants(activityId)
      .then((participants) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({ isLoading: false, error: null, participants });
      })
      .catch((error: { message?: string }) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({
          isLoading: false,
          error: error?.message ?? 'Impossible de charger les participants.',
          participants: [],
        });
      });
  }, [activityId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refetch: load };
}
