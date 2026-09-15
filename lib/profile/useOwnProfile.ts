import { useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import type { VerificationStatus } from '@/types/models';

export type OwnProfile = {
  displayName: string;
  nationality: string;
  languages: string[];
  verificationStatus: VerificationStatus;
};

type State = {
  /** userId pour lequel `profile`/`isLoading` ci-dessous sont valides. */
  userId: string | undefined;
  profile: OwnProfile | null;
  isLoading: boolean;
};

async function fetchOwnProfile(userId: string): Promise<OwnProfile | null> {
  // La policy SELECT sur `profiles` est ouverte à tout utilisateur authentifié
  // (nécessaire pour voir le profil d'un organisateur/participant) : filtrage
  // explicite sur `id`, même pattern que `useActiveTrip`/`useHasTrip`.
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, nationality, languages, verification_status')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    displayName: data.display_name,
    nationality: data.nationality,
    languages: data.languages,
    verificationStatus: data.verification_status as VerificationStatus,
  };
}

/**
 * Profil de l'utilisateur courant (nom, nationalité, langues, statut de
 * vérification), pour l'écran Profil. Même stratégie anti-flicker que
 * `useActiveTrip`/`useHasTrip` : `isLoading`/`profile` sont dérivés en
 * comparant le `userId` associé au dernier résultat connu au `userId`
 * demandé par l'appelant.
 */
export function useOwnProfile(userId: string | undefined) {
  const [state, setState] = useState<State>({ userId: undefined, profile: null, isLoading: true });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setState({ userId, profile: null, isLoading: false });
      return;
    }

    setState({ userId, profile: null, isLoading: true });

    fetchOwnProfile(userId)
      .then((profile) => {
        if (!isMountedRef.current) return;
        setState({ userId, profile, isLoading: false });
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setState({ userId, profile: null, isLoading: false });
      });
  }, [userId]);

  const isLoading = state.userId !== userId || state.isLoading;
  const profile = state.userId === userId ? state.profile : null;

  return { profile, isLoading };
}
