import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import type { ActivityType, ParticipationStatus } from '@/types/models';

export type ActivityDetail = {
  id: string;
  tripId: string;
  // Propriétaire du trip parent (= propriétaire de l'activité, les policies
  // RLS `activities_*_trip_owner` raisonnent sur le même critère). `null` si
  // le trip a été détaché (`trips.user_id` -> NULL, suppression de compte de
  // l'organisateur, cf. migration RGPD) : dans ce cas personne ne peut plus
  // se voir comme propriétaire.
  tripOwnerId: string | null;
  title: string;
  description: string | null;
  type: ActivityType;
  dateTime: string;
  locationLabel: string;
  spots: number;
  spotsTaken: number;
  organizer: {
    displayName: string;
    nationality: string;
    languages: string[];
  } | null;
};

export type OwnParticipation = {
  id: string;
  status: ParticipationStatus;
} | null;

// Formes brutes renvoyées par les requêtes ci-dessous — même approche que
// `useDiscoverFeed.ts` en l'absence de `types/database.ts` généré.
type ActivityDetailRow = {
  id: string;
  trip_id: string;
  title: string;
  description: string | null;
  type: ActivityType;
  date_time: string;
  location_label: string;
  spots: number;
  trip: {
    user_id: string | null;
    organizer: {
      display_name: string;
      nationality: string;
      languages: string[];
    } | null;
  } | null;
};

type ParticipantCountRow = {
  activity_id: string;
  taken_count: number;
};

type OwnParticipationRow = {
  id: string;
  status: ParticipationStatus;
};

type State = {
  isLoading: boolean;
  error: string | null;
  activity: ActivityDetail | null;
  ownParticipation: OwnParticipation;
};

async function fetchActivityDetail(
  activityId: string,
  userId: string | undefined
): Promise<{ activity: ActivityDetail | null; ownParticipation: OwnParticipation }> {
  const { data, error } = await supabase
    .from('activities')
    .select(
      `
        id,
        trip_id,
        title,
        description,
        type,
        date_time,
        location_label,
        spots,
        trip:trips(
          user_id,
          organizer:profiles(
            display_name,
            nationality,
            languages
          )
        )
      `
    )
    .eq('id', activityId)
    .maybeSingle()
    .returns<ActivityDetailRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return { activity: null, ownParticipation: null };
  }

  // Places prises : même RPC SECURITY DEFINER que `useDiscoverFeed` (un select
  // direct sur `participations` est filtré par RLS et ne verrait, la plupart
  // du temps, aucune ligne appartenant à d'autres utilisateurs).
  const { data: counts, error: countsError } = await supabase.rpc(
    'activity_participant_counts',
    { p_activity_ids: [data.id] }
  );

  if (countsError) {
    throw countsError;
  }

  const spotsTaken =
    ((counts ?? []) as ParticipantCountRow[]).find((row) => row.activity_id === data.id)
      ?.taken_count ?? 0;

  // Participation de l'utilisateur courant sur CETTE activité : requête
  // directe (pas la RPC ci-dessus), couverte par
  // `participations_select_self_or_owner` puisqu'on filtre explicitement sur
  // `user_id = session.user.id`.
  let ownParticipation: OwnParticipation = null;
  if (userId) {
    const { data: participationRow, error: participationError } = await supabase
      .from('participations')
      .select('id, status')
      .eq('activity_id', data.id)
      .eq('user_id', userId)
      .maybeSingle()
      .returns<OwnParticipationRow>();

    if (participationError) {
      throw participationError;
    }

    ownParticipation = participationRow;
  }

  return {
    activity: {
      id: data.id,
      tripId: data.trip_id,
      tripOwnerId: data.trip?.user_id ?? null,
      title: data.title,
      description: data.description,
      type: data.type,
      dateTime: data.date_time,
      locationLabel: data.location_label,
      spots: data.spots,
      spotsTaken,
      organizer: data.trip?.organizer
        ? {
            displayName: data.trip.organizer.display_name,
            nationality: data.trip.organizer.nationality,
            languages: data.trip.organizer.languages,
          }
        : null,
    },
    ownParticipation,
  };
}

/**
 * Détail d'une sortie (organisateur, places restantes, description) +
 * participation propre de l'utilisateur courant, si elle existe. Expose
 * `refetch` pour rafraîchir l'état après une action (rejoindre / relancer une
 * demande) — pas de souscription Realtime au MVP, un simple refetch suffit.
 */
export function useActivityDetail(activityId: string | undefined, userId: string | undefined) {
  const [state, setState] = useState<State>({
    isLoading: true,
    error: null,
    activity: null,
    ownParticipation: null,
  });
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

    if (!activityId) {
      setState({ isLoading: false, error: null, activity: null, ownParticipation: null });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchActivityDetail(activityId, userId)
      .then(({ activity, ownParticipation }) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({ isLoading: false, error: null, activity, ownParticipation });
      })
      .catch((error: { message?: string }) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({
          isLoading: false,
          error: error?.message ?? 'Impossible de charger cette sortie.',
          activity: null,
          ownParticipation: null,
        });
      });
  }, [activityId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, refetch: load };
}
