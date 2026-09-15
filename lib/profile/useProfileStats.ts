import { useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export type ProfileStats = {
  /** Nombre d'activités publiées sur l'un des voyages de l'utilisateur. */
  activitiesOrganized: number;
  /** Nombre de participations confirmées (statut 'confirmed') de l'utilisateur. */
  confirmedParticipations: number;
};

type State = {
  /** userId pour lequel `stats`/`isLoading` ci-dessous sont valides. */
  userId: string | undefined;
  stats: ProfileStats | null;
  isLoading: boolean;
};

async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  // Les activités "organisées" sont celles publiées sur un trip possédé par
  // l'utilisateur. Pas d'embedding filtré (`trips!inner`) ici : deux requêtes
  // simples, explicites sur `user_id`/`trip_id`, plus lisibles que la syntaxe
  // de filtre sur ressource imbriquée de PostgREST, pour un volume de données
  // qui reste très faible au MVP mono-ville.
  const { data: trips, error: tripsError } = await supabase
    .from('trips')
    .select('id')
    .eq('user_id', userId);

  if (tripsError) {
    throw tripsError;
  }

  const tripIds = (trips ?? []).map((trip) => trip.id);

  let activitiesOrganized = 0;
  if (tripIds.length > 0) {
    const { count, error } = await supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .in('trip_id', tripIds);

    if (error) {
      throw error;
    }

    activitiesOrganized = count ?? 0;
  }

  // Couvert par la policy `participations_select_self_or_owner` (on filtre
  // explicitement sur ses propres participations, pas besoin de la RPC
  // `activity_participant_counts` utilisée côté feed pour les participations
  // des autres).
  const { count: confirmedCount, error: participationsError } = await supabase
    .from('participations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'confirmed');

  if (participationsError) {
    throw participationsError;
  }

  return { activitiesOrganized, confirmedParticipations: confirmedCount ?? 0 };
}

/**
 * Statistiques simples affichées sur l'écran Profil : nombre d'activités
 * organisées et nombre de participations confirmées. Même stratégie
 * anti-flicker que les autres hooks `lib/trips`/`lib/profile`.
 */
export function useProfileStats(userId: string | undefined) {
  const [state, setState] = useState<State>({ userId: undefined, stats: null, isLoading: true });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setState({ userId, stats: null, isLoading: false });
      return;
    }

    setState({ userId, stats: null, isLoading: true });

    fetchProfileStats(userId)
      .then((stats) => {
        if (!isMountedRef.current) return;
        setState({ userId, stats, isLoading: false });
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setState({ userId, stats: null, isLoading: false });
      });
  }, [userId]);

  const isLoading = state.userId !== userId || state.isLoading;
  const stats = state.userId === userId ? state.stats : null;

  return { stats, isLoading };
}
