import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

type State = {
  isLoading: boolean;
  isBlocked: boolean;
  isToggling: boolean;
  error: string | null;
};

/**
 * État + action de blocage entre l'utilisateur courant et `targetUserId`.
 * Ne reflète que le sens "moi -> cible" (`blocks_select_own` ne renvoie de
 * toute façon jamais les blocages dont on est la cible, par design — voir la
 * migration `add_blocks_reports_ratings.sql`) : le bouton affiché est donc
 * toujours "Bloquer"/"Débloquer" de mon point de vue, jamais un état "cette
 * personne vous a bloqué".
 */
export function useBlockUser(currentUserId: string | undefined, targetUserId: string | undefined) {
  const [state, setState] = useState<State>({
    isLoading: true,
    isBlocked: false,
    isToggling: false,
    error: null,
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

    if (!currentUserId || !targetUserId) {
      setState({ isLoading: false, isBlocked: false, isToggling: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    supabase
      .from('blocks')
      .select('id')
      .eq('blocker_id', currentUserId)
      .eq('blocked_id', targetUserId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        if (error) {
          setState({
            isLoading: false,
            isBlocked: false,
            isToggling: false,
            error: 'Impossible de charger le statut de blocage.',
          });
          return;
        }
        setState({ isLoading: false, isBlocked: !!data, isToggling: false, error: null });
      });
  }, [currentUserId, targetUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBlock = useCallback(async () => {
    if (!currentUserId || !targetUserId) return;

    setState((prev) => ({ ...prev, isToggling: true, error: null }));

    const { error } = state.isBlocked
      ? await supabase
          .from('blocks')
          .delete()
          .eq('blocker_id', currentUserId)
          .eq('blocked_id', targetUserId)
      : await supabase.from('blocks').insert({ blocker_id: currentUserId, blocked_id: targetUserId });

    if (!isMountedRef.current) return;

    if (error) {
      setState((prev) => ({
        ...prev,
        isToggling: false,
        error: "Cette action n'a pas pu être effectuée. Réessayez.",
      }));
      return;
    }

    setState((prev) => ({ ...prev, isToggling: false, isBlocked: !prev.isBlocked, error: null }));
  }, [currentUserId, targetUserId, state.isBlocked]);

  return { ...state, toggleBlock };
}
