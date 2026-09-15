import { useEffect, useRef, useState } from 'react';

import { parseGeographyPointHex } from '@/lib/geo/wkb';
import { supabase } from '@/lib/supabase/client';

export type ActiveTrip = {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  // Point PostGIS du trip (voir `parseGeographyPointHex`) : exposé pour que
  // la création d'activité (`app/(tabs)/activities/index.tsx`) puisse
  // réutiliser le même point plutôt que d'introduire un nouveau placeholder.
  // `null` si le décodage échoue (ne devrait pas arriver en pratique, la
  // colonne est NOT NULL et toujours écrite via `toPointWkt`/le même format).
  location: { lat: number; lng: number } | null;
};

type State = {
  /** userId pour lequel `trip`/`isLoading` ci-dessous sont valides. */
  userId: string | undefined;
  trip: ActiveTrip | null;
  isLoading: boolean;
};

async function fetchActiveTrip(userId: string): Promise<ActiveTrip | null> {
  // Pas de notion de "voyage actif" en base (une seule ligne `trips` par
  // utilisateur au MVP, créée à l'onboarding) : on prend le plus récent par
  // sécurité si jamais plusieurs trips existent un jour. Filtrage explicite
  // sur `user_id` requis, même pattern que `useHasTrip` (policy SELECT
  // ouverte à tout utilisateur authentifié).
  const { data, error } = await supabase
    .from('trips')
    .select('id, destination, start_date, end_date, location')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    destination: data.destination,
    startDate: data.start_date,
    endDate: data.end_date,
    location: parseGeographyPointHex(data.location as unknown as string),
  };
}

/**
 * Voyage actif de l'utilisateur courant (destination + fenêtre de dates),
 * utilisé comme filtre par défaut du feed "Découvrir". Même stratégie
 * anti-flicker que `useHasTrip` : `isLoading`/`trip` sont dérivés en
 * comparant le `userId` associé au dernier résultat connu au `userId`
 * demandé par l'appelant.
 */
export function useActiveTrip(userId: string | undefined) {
  const [state, setState] = useState<State>({ userId: undefined, trip: null, isLoading: true });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setState({ userId, trip: null, isLoading: false });
      return;
    }

    setState({ userId, trip: null, isLoading: true });

    fetchActiveTrip(userId)
      .then((trip) => {
        if (!isMountedRef.current) return;
        setState({ userId, trip, isLoading: false });
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setState({ userId, trip: null, isLoading: false });
      });
  }, [userId]);

  const isLoading = state.userId !== userId || state.isLoading;
  const trip = state.userId === userId ? state.trip : null;

  return { trip, isLoading };
}
