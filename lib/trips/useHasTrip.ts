import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export type UseHasTripResult = {
  hasTrip: boolean;
  isLoading: boolean;
  /**
   * Relance la vérification (ex. juste après la création d'un trip).
   * Contrairement au fetch initial déclenché au montage, les erreurs ne sont
   * PAS avalées ici : l'appelant reçoit `{ success: false }` et doit pouvoir
   * réagir (ex. ne pas considérer le trip comme "pris en compte", afficher
   * un message d'erreur avec retry) plutôt que rester bloqué silencieusement
   * sur un `hasTrip` qui n'a pas pu être rafraîchi.
   */
  refetch: () => Promise<{ success: boolean }>;
};

type State = {
  /** userId pour lequel `hasTrip`/`isLoading` ci-dessous sont valides. */
  userId: string | undefined;
  hasTrip: boolean;
  isLoading: boolean;
};

async function fetchHasTrip(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('trips')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  return !!count && count > 0;
}

/**
 * Est-ce que l'utilisateur `userId` a déjà au moins un trip ?
 * La policy SELECT sur `trips` est ouverte à tout utilisateur authentifié
 * (produit de découverte), donc on filtre explicitement sur `user_id` ici —
 * on ne peut pas compter sur RLS pour restreindre le résultat au propriétaire.
 *
 * `isLoading` est dérivé en comparant le `userId` associé au dernier résultat
 * connu (`state.userId`) au `userId` demandé par l'appelant : tant qu'ils
 * diffèrent, on est nécessairement en attente d'un résultat pour ce nouveau
 * `userId`, même avant que l'effet ci-dessous n'ait eu la chance de tourner.
 * Sans ça, un rendu où `userId` vient tout juste de passer de `undefined` à
 * une vraie valeur (ex. juste après résolution de `getSession()`) afficherait
 * encore `hasTrip=false`/`isLoading=false` calculés pour l'ancien `userId`,
 * ce qui fait flasher l'écran onboarding pour un utilisateur qui a pourtant
 * déjà un trip.
 */
export function useHasTrip(userId: string | undefined): UseHasTripResult {
  const [state, setState] = useState<State>({
    userId: undefined,
    hasTrip: false,
    isLoading: true,
  });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setState({ userId, hasTrip: false, isLoading: false });
      return;
    }

    setState({ userId, hasTrip: false, isLoading: true });

    fetchHasTrip(userId)
      .then((hasTrip) => {
        if (!isMountedRef.current) return;
        setState({ userId, hasTrip, isLoading: false });
      })
      .catch(() => {
        // Effet de montage : on avale l'erreur ici (comportement standard
        // pour un effet de chargement initial). `refetch` ci-dessous, en
        // revanche, propage l'échec à l'appelant — voir sa JSDoc.
        if (!isMountedRef.current) return;
        setState({ userId, hasTrip: false, isLoading: false });
      });
  }, [userId]);

  const refetch = useCallback(async (): Promise<{ success: boolean }> => {
    if (!userId) {
      setState({ userId, hasTrip: false, isLoading: false });
      return { success: true };
    }

    setState({ userId, hasTrip: false, isLoading: true });

    try {
      const hasTrip = await fetchHasTrip(userId);
      if (isMountedRef.current) {
        setState({ userId, hasTrip, isLoading: false });
      }
      return { success: true };
    } catch {
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, userId, isLoading: false }));
      }
      return { success: false };
    }
  }, [userId]);

  const isLoading = state.userId !== userId || state.isLoading;
  const hasTrip = state.userId === userId && state.hasTrip;

  return { hasTrip, isLoading, refetch };
}
