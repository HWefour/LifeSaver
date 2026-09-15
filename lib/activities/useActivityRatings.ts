import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

type State = {
  isLoading: boolean;
  // Participants déjà notés par l'utilisateur courant sur cette activité.
  ratedUserIds: Set<string>;
  submittingUserId: string | null;
  error: string | null;
};

async function fetchOwnRatedIds(activityId: string, raterId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('ratings')
    .select('rated_id')
    .eq('activity_id', activityId)
    .eq('rater_id', raterId)
    .returns<{ rated_id: string }[]>();

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => row.rated_id));
}

/**
 * Notes déjà posées par l'utilisateur courant sur une activité + action pour
 * en poser une nouvelle. La policy `ratings_insert_confirmed_past_activity`
 * fait déjà toute la validation métier (activité passée, rater/rated tous
 * deux confirmés) côté serveur : ce hook ne fait que réagir à un éventuel
 * refus plutôt que de dupliquer ces règles côté client.
 */
export function useActivityRatings(
  activityId: string | undefined,
  raterId: string | undefined,
  enabled: boolean
) {
  const [state, setState] = useState<State>({
    isLoading: true,
    ratedUserIds: new Set(),
    submittingUserId: null,
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

    if (!activityId || !raterId || !enabled) {
      setState({ isLoading: false, ratedUserIds: new Set(), submittingUserId: null, error: null });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchOwnRatedIds(activityId, raterId)
      .then((ratedUserIds) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({ isLoading: false, ratedUserIds, submittingUserId: null, error: null });
      })
      .catch(() => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({
          isLoading: false,
          ratedUserIds: new Set(),
          submittingUserId: null,
          error: 'Impossible de charger vos évaluations.',
        });
      });
  }, [activityId, raterId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const rate = useCallback(
    async (ratedUserId: string, score: number) => {
      if (!activityId || !raterId) return;

      setState((prev) => ({ ...prev, submittingUserId: ratedUserId, error: null }));

      const { error } = await supabase
        .from('ratings')
        .insert({ activity_id: activityId, rater_id: raterId, rated_id: ratedUserId, score });

      if (!isMountedRef.current) return;

      if (error) {
        setState((prev) => ({
          ...prev,
          submittingUserId: null,
          error: "Cette évaluation n'a pas pu être envoyée. Réessayez.",
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        submittingUserId: null,
        error: null,
        ratedUserIds: new Set(prev.ratedUserIds).add(ratedUserId),
      }));
    },
    [activityId, raterId]
  );

  return { ...state, rate };
}
