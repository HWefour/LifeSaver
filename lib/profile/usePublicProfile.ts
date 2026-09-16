import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import type { VerificationStatus } from '@/types/models';

export type PublicProfile = {
  id: string;
  displayName: string;
  nationality: string;
  languages: string[];
  verificationStatus: VerificationStatus;
  averageScore: number | null;
  ratingsCount: number;
};

type ProfileRow = {
  id: string;
  display_name: string;
  nationality: string;
  languages: string[];
  verification_status: VerificationStatus;
};

type AverageRow = {
  profile_id: string;
  average_score: number;
  ratings_count: number;
};

type State = {
  isLoading: boolean;
  // `null` recouvre deux cas indistinguables côté client (et volontairement
  // non distingués côté UI, pour ne pas révéler à un utilisateur bloqué
  // qu'il l'est) : profil inexistant, ou masqué par `profiles_select_authenticated`
  // à cause d'une relation de blocage dans un sens ou l'autre.
  profile: PublicProfile | null;
  error: string | null;
};

async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, nationality, languages, verification_status')
    .eq('id', userId)
    .maybeSingle()
    .returns<ProfileRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  // RPC dédiée (comme `activity_participant_counts`) plutôt qu'un select +
  // agrégation côté client sur `ratings`, qui rapatrierait aussi les
  // colonnes `comment`/`rater_id` inutiles ici.
  const { data: averages, error: averagesError } = await supabase.rpc(
    'profile_average_ratings',
    { p_profile_ids: [userId] }
  );

  if (averagesError) {
    throw averagesError;
  }

  const average = ((averages ?? []) as AverageRow[]).find((row) => row.profile_id === userId);

  return {
    id: data.id,
    displayName: data.display_name,
    nationality: data.nationality,
    languages: data.languages,
    verificationStatus: data.verification_status,
    averageScore: average?.average_score ?? null,
    ratingsCount: average?.ratings_count ?? 0,
  };
}

/**
 * Profil public d'un autre utilisateur (organisateur, participant) + sa note
 * moyenne. Renvoie `profile: null` aussi bien si le profil n'existe plus que
 * s'il est masqué par un blocage (RLS `profiles_select_authenticated`) — le
 * client ne peut de toute façon pas distinguer les deux cas, ce qui est le
 * comportement voulu.
 */
export function usePublicProfile(userId: string | undefined) {
  const [state, setState] = useState<State>({ isLoading: true, profile: null, error: null });
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

    if (!userId) {
      setState({ isLoading: false, profile: null, error: null });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchPublicProfile(userId)
      .then((profile) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({ isLoading: false, profile, error: null });
      })
      .catch((error: { message?: string }) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({
          isLoading: false,
          profile: null,
          error: error?.message ?? 'Impossible de charger ce profil.',
        });
      });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refetch: load };
}
