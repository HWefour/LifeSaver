import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export type ParticipationRequest = {
  id: string;
  userId: string;
  displayName: string;
  nationality: string;
  languages: string[];
  createdAt: string;
};

type RequestRow = {
  id: string;
  user_id: string;
  created_at: string;
  requester: {
    display_name: string;
    nationality: string;
    languages: string[];
  } | null;
};

type State = {
  isLoading: boolean;
  error: string | null;
  requests: ParticipationRequest[];
};

async function fetchRequests(activityId: string): Promise<ParticipationRequest[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('id, user_id, created_at, requester:profiles(display_name, nationality, languages)')
    .eq('activity_id', activityId)
    .eq('status', 'requested')
    .order('created_at', { ascending: true })
    .returns<RequestRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    displayName: row.requester?.display_name ?? 'Voyageur',
    nationality: row.requester?.nationality ?? '',
    languages: row.requester?.languages ?? [],
    createdAt: row.created_at,
  }));
}

/**
 * Demandes de participation ('requested') en attente pour une activité,
 * réservé au propriétaire de la sortie (RLS `participations_select_self_or_owner`
 * — un non-propriétaire ne verrait de toute façon que sa propre ligne). Expose
 * `confirm`/`decline`, couverts côté backend par `participations_update_owner`.
 *
 * Pas de souscription Realtime ici (comme `useActivityDetail`) : un simple
 * `refetch` après action suffit au MVP, l'écran n'a pas vocation à rester
 * ouvert en tâche de fond en attendant de nouvelles demandes.
 */
export function useParticipationRequests(activityId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<State>({ isLoading: true, error: null, requests: [] });
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  // Verrous par ligne pour désactiver le bouton de la ligne en cours d'action
  // sans bloquer les autres lignes de la liste.
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;

    if (!activityId || !enabled) {
      setState({ isLoading: false, error: null, requests: [] });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchRequests(activityId)
      .then((requests) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({ isLoading: false, error: null, requests });
      })
      .catch((error: { message?: string }) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState({
          isLoading: false,
          error: error?.message ?? 'Impossible de charger les demandes.',
          requests: [],
        });
      });
  }, [activityId, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const respond = useCallback(
    async (participationId: string, status: 'confirmed' | 'declined') => {
      setActingIds((prev) => new Set(prev).add(participationId));

      const { error } = await supabase
        .from('participations')
        .update({ status })
        .eq('id', participationId);

      if (!isMountedRef.current) return;

      setActingIds((prev) => {
        const next = new Set(prev);
        next.delete(participationId);
        return next;
      });

      if (error) {
        setState((prev) => ({
          ...prev,
          error: "Impossible de traiter cette demande pour l'instant. Réessayez.",
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        error: null,
        requests: prev.requests.filter((r) => r.id !== participationId),
      }));
    },
    []
  );

  return {
    ...state,
    actingIds,
    refetch: load,
    confirm: (participationId: string) => respond(participationId, 'confirmed'),
    decline: (participationId: string) => respond(participationId, 'declined'),
  };
}
