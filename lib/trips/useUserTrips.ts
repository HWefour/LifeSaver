import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export type UserTrip = {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  /** Nombre d'activités publiées sur ce voyage. */
  activitiesCount: number;
};

type State = {
  /** userId pour lequel `trips`/`isLoading` ci-dessous sont valides. */
  userId: string | undefined;
  trips: UserTrip[];
  isLoading: boolean;
};

async function fetchUserTrips(userId: string): Promise<UserTrip[]> {
  // La policy SELECT sur `trips` est ouverte à tout utilisateur authentifié
  // (produit de découverte) : filtrage explicite sur `user_id`, même pattern
  // que `useActiveTrip`/`useHasTrip`.
  const { data, error } = await supabase
    .from('trips')
    .select('id, destination, start_date, end_date')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const trips = data ?? [];
  const tripIds = trips.map((trip) => trip.id);

  // Compte d'activités par voyage : ce sont les propres trips/activités de
  // l'utilisateur, pas de souci de visibilité RLS ici (contrairement au feed
  // "Découvrir", pas besoin de la RPC `activity_participant_counts`). Une
  // seule requête, comptage côté client — volume faible au MVP mono-ville.
  const countsByTrip = new Map<string, number>();
  if (tripIds.length > 0) {
    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('trip_id')
      .in('trip_id', tripIds);

    if (activitiesError) {
      throw activitiesError;
    }

    for (const row of activities ?? []) {
      countsByTrip.set(row.trip_id, (countsByTrip.get(row.trip_id) ?? 0) + 1);
    }
  }

  return trips.map((trip) => ({
    id: trip.id,
    destination: trip.destination,
    startDate: trip.start_date,
    endDate: trip.end_date,
    activitiesCount: countsByTrip.get(trip.id) ?? 0,
  }));
}

/**
 * Liste des voyages de l'utilisateur courant, avec le nombre d'activités
 * publiées sur chacun. Expose `refetch` pour rafraîchir la liste au retour
 * de l'écran de création d'un nouveau voyage (pas de souscription Realtime au
 * MVP, un simple refetch au focus suffit).
 */
export function useUserTrips(userId: string | undefined) {
  const [state, setState] = useState<State>({ userId: undefined, trips: [], isLoading: true });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    if (!userId) {
      setState({ userId, trips: [], isLoading: false });
      return;
    }

    setState((prev) => ({ ...prev, userId, isLoading: true }));

    fetchUserTrips(userId)
      .then((trips) => {
        if (!isMountedRef.current) return;
        setState({ userId, trips, isLoading: false });
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        // Même logique que `useHasTrip.refetch` : un échec de refetch (ex.
        // blip réseau au retour sur l'onglet, cf. `useFocusEffect` dans
        // app/(tabs)/trips/index.tsx) ne doit pas effacer une liste déjà
        // chargée avec succès. On ne repart de `[]` que si ce `userId` n'avait
        // encore jamais été chargé (premier montage, ou changement d'utilisateur).
        setState((prev) =>
          prev.userId === userId
            ? { userId, trips: prev.trips, isLoading: false }
            : { userId, trips: [], isLoading: false }
        );
      });
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const isLoading = state.userId !== userId || state.isLoading;
  const trips = state.userId === userId ? state.trips : [];

  return { trips, isLoading, refetch: load };
}
