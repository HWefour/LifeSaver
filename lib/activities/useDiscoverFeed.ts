import { useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import type { ActivityType } from '@/types/models';

export type DiscoverActivity = {
  id: string;
  title: string;
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

// Forme brute renvoyée par la requête `select` ci-dessous (embedding
// imbriqué activities -> trips -> profiles). Sans `types/database.ts`
// généré, le client Supabase n'est pas typé de bout en bout : on documente
// donc la forme attendue ici plutôt que de laisser `any` se propager.
type ActivityRow = {
  id: string;
  title: string;
  type: ActivityType;
  date_time: string;
  location_label: string;
  spots: number;
  trip: {
    organizer: {
      display_name: string;
      nationality: string;
      languages: string[];
    } | null;
  } | null;
};

// Forme de chaque ligne renvoyée par la RPC `activity_participant_counts`.
type ParticipantCountRow = {
  activity_id: string;
  taken_count: number;
};

type State = {
  isLoading: boolean;
  error: string | null;
  activities: DiscoverActivity[];
};

const FEED_LIMIT = 30;

async function fetchDiscoverFeed(
  startDate: string,
  endDate: string,
  selectedTypes: ActivityType[]
): Promise<DiscoverActivity[]> {
  // Fenêtre de dates = dates du trip actif, bornes larges (début/fin de
  // journée) faute de fuseau horaire connu par ville — le MVP mono-ville ne
  // justifie pas plus de précision ici.
  const startIso = `${startDate}T00:00:00`;
  const endIso = `${endDate}T23:59:59`;

  // Embedding imbriqué à deux niveaux (activities -> trips -> profiles) :
  // fonctionne car chaque relation est portée par une FK non ambiguë
  // (activities.trip_id -> trips.id, trips.user_id -> profiles.id).
  // Les filtres nationalité/langue sont déjà appliqués côté serveur par la
  // policy RLS `activities_select_visible`, pas besoin de les dupliquer ici.
  let query = supabase
    .from('activities')
    .select(
      `
        id,
        title,
        type,
        date_time,
        location_label,
        spots,
        trip:trips(
          organizer:profiles(
            display_name,
            nationality,
            languages
          )
        )
      `
    )
    .gte('date_time', startIso)
    .lte('date_time', endIso)
    .order('date_time', { ascending: true })
    .limit(FEED_LIMIT);

  if (selectedTypes.length > 0) {
    query = query.in('type', selectedTypes);
  }

  const { data, error } = await query.returns<ActivityRow[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const activityIds = rows.map((row) => row.id);

  // Places prises = comptes agrégés via la RPC `activity_participant_counts`
  // (SECURITY DEFINER). Un `select` direct sur `participations` est
  // silencieusement filtré par RLS : la policy `participations_select_self_or_owner`
  // ne rend visibles que ses propres participations ou celles des
  // activités qu'on possède, donc un décompte client-side retombait à 0
  // pour la quasi-totalité des viewers.
  const takenByActivity = new Map<string, number>();
  if (activityIds.length > 0) {
    const { data: counts, error: countsError } = await supabase.rpc(
      'activity_participant_counts',
      { p_activity_ids: activityIds }
    );

    if (countsError) {
      throw countsError;
    }

    for (const row of (counts ?? []) as ParticipantCountRow[]) {
      takenByActivity.set(row.activity_id, row.taken_count);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    dateTime: row.date_time,
    locationLabel: row.location_label,
    spots: row.spots,
    spotsTaken: takenByActivity.get(row.id) ?? 0,
    organizer: row.trip?.organizer
      ? {
          displayName: row.trip.organizer.display_name,
          nationality: row.trip.organizer.nationality,
          languages: row.trip.organizer.languages,
        }
      : null,
  }));
}

/**
 * Feed "Découvrir" : activités dont la date tombe dans la fenêtre du trip
 * actif de l'utilisateur, filtrées par type sélectionné. Pas de pagination
 * infinie (volume faible au MVP) — une limite simple suffit.
 */
export function useDiscoverFeed(
  startDate: string | undefined,
  endDate: string | undefined,
  selectedTypes: ActivityType[]
) {
  const [state, setState] = useState<State>({ isLoading: true, error: null, activities: [] });
  const isMountedRef = useRef(true);
  // Id de requête, incrémenté à chaque déclenchement de l'effet : protège
  // contre une réponse réseau périmée (ex. toggle rapide de filtre) qui
  // reviendrait après une requête plus récente et écraserait son résultat.
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const selectedTypesKey = selectedTypes.slice().sort().join(',');

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    if (!startDate || !endDate) {
      setState({ isLoading: false, error: null, activities: [] });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchDiscoverFeed(startDate, endDate, selectedTypes)
      .then((activities) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({ isLoading: false, error: null, activities });
      })
      .catch((error: { message?: string }) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({
          isLoading: false,
          error: error?.message ?? 'Impossible de charger les sorties.',
          activities: [],
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, selectedTypesKey]);

  return state;
}
