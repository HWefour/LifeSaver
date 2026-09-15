import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/client';

const DELETED_AUTHOR_LABEL = 'Utilisateur supprimé';
const SELF_AUTHOR_LABEL = 'Vous';

export type MessageItem = {
  id: string;
  userId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
};

// État de l'abonnement Realtime au canal `messages:<activityId>`. Sert
// uniquement à afficher un retour visuel discret côté UI (le client
// Supabase gère déjà la reconnexion transport de base, pas besoin de
// logique de reconnexion applicative ici) — les messages qu'on envoie
// soi-même sont ajoutés directement par `sendMessage` et ne dépendent donc
// pas de cet état ; seule la réception des messages *des autres*
// participants en dépend.
export type RealtimeStatus = 'connecting' | 'connected' | 'error';

// Forme brute renvoyée par le select initial (embedding `profiles` via la FK
// `messages.user_id -> profiles.id`). `author` est `null` soit quand
// `user_id` est déjà `null` (anonymisation RGPD), soit — cas théorique,
// RLS de `profiles` mise à part — si l'auteur n'est plus visible.
type MessageRow = {
  id: string;
  user_id: string | null;
  body: string;
  created_at: string;
  author: { display_name: string } | null;
};

// Payload brut d'un événement Realtime INSERT sur `messages` : uniquement
// les colonnes de la table, pas d'embedding possible côté `postgres_changes`.
type MessageInsertPayload = {
  id: string;
  activity_id: string;
  user_id: string | null;
  body: string;
  created_at: string;
};

type State = {
  isLoading: boolean;
  error: string | null;
  messages: MessageItem[];
  realtimeStatus: RealtimeStatus;
};

async function fetchMessages(activityId: string): Promise<MessageItem[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, user_id, body, created_at, author:profiles(display_name)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: true })
    .returns<MessageRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    authorName: row.author?.display_name ?? DELETED_AUTHOR_LABEL,
    body: row.body,
    createdAt: row.created_at,
  }));
}

/**
 * Messages d'une sortie + abonnement Realtime aux nouveaux messages.
 *
 * Le payload Realtime `postgres_changes` ne contient que les colonnes brutes
 * de `messages` (pas l'embedding `profiles` utilisé au chargement initial) :
 * pour éviter une requête `profiles` par message reçu, on maintient un cache
 * local `userId -> displayName`, peuplé au fil des messages déjà vus (chargement
 * initial + Realtime). Seul le tout premier message Realtime d'un auteur pas
 * encore croisé dans la conversation déclenche un lookup `profiles` ponctuel.
 *
 * `sendMessage` insère directement et ajoute le message renvoyé à l'état
 * local plutôt que d'attendre l'écho Realtime : `postgres_changes` ne
 * rattrape pas les events émis avant que le canal soit pleinement
 * `SUBSCRIBED` (aller-retour WebSocket), donc un envoi juste après
 * l'ouverture de l'écran pourrait ne jamais revenir à son propre auteur si
 * on ne comptait que sur Realtime. Le dédoublonnage par `id` (partagé avec
 * le handler Realtime via `appendMessage`) absorbe sans risque l'écho
 * Realtime de ce même message s'il arrive quand même ensuite.
 */
export function useMessages(activityId: string | undefined, currentUserId: string | undefined) {
  const [state, setState] = useState<State>({
    isLoading: true,
    error: null,
    messages: [],
    realtimeStatus: 'connecting',
  });
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const authorNamesRef = useRef(new Map<string, string>());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Ajout dédupliqué (par `id`) d'un message à l'état local — partagé entre
  // le handler Realtime (messages des autres) et `sendMessage` (nos propres
  // messages, ajoutés dès l'insert confirmé).
  const appendMessage = useCallback((message: MessageItem) => {
    if (!isMountedRef.current) return;
    setState((prev) => {
      if (prev.messages.some((m) => m.id === message.id)) return prev;
      return { ...prev, messages: [...prev.messages, message] };
    });
  }, []);

  const load = useCallback(() => {
    const requestId = ++requestIdRef.current;

    if (!activityId) {
      setState((prev) => ({ ...prev, isLoading: false, error: null, messages: [] }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    fetchMessages(activityId)
      .then((messages) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        for (const message of messages) {
          if (message.userId) {
            authorNamesRef.current.set(message.userId, message.authorName);
          }
        }
        setState((prev) => ({ ...prev, isLoading: false, error: null, messages }));
      })
      .catch((error: { message?: string }) => {
        if (!isMountedRef.current || requestIdRef.current !== requestId) return;
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error?.message ?? 'Impossible de charger la discussion.',
          messages: [],
        }));
      });
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  // Abonnement Realtime aux nouveaux messages de cette activité (messages
  // des autres participants — les nôtres sont ajoutés par `sendMessage`).
  useEffect(() => {
    if (!activityId) return;

    setState((prev) => ({ ...prev, realtimeStatus: 'connecting' }));

    const channel = supabase
      .channel(`messages:${activityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `activity_id=eq.${activityId}`,
        },
        (payload: RealtimePostgresInsertPayload<MessageInsertPayload>) => {
          const row = payload.new;

          function handle(authorName: string) {
            appendMessage({
              id: row.id,
              userId: row.user_id,
              authorName,
              body: row.body,
              createdAt: row.created_at,
            });
          }

          if (row.user_id === currentUserId) {
            // Notre propre message : déjà ajouté par `sendMessage`, ce
            // handler ne fait qu'absorber l'écho grâce à la dédup par `id`.
            handle(SELF_AUTHOR_LABEL);
            return;
          }

          if (!row.user_id) {
            handle(DELETED_AUTHOR_LABEL);
            return;
          }

          const cached = authorNamesRef.current.get(row.user_id);
          if (cached) {
            handle(cached);
            return;
          }

          supabase
            .from('profiles')
            .select('display_name')
            .eq('id', row.user_id)
            .maybeSingle()
            .then(({ data }) => {
              const name = data?.display_name ?? DELETED_AUTHOR_LABEL;
              if (row.user_id) {
                authorNamesRef.current.set(row.user_id, name);
              }
              handle(name);
            });
        }
      )
      // Callback de statut : pas de logique de reconnexion applicative (le
      // client Supabase gère déjà la reconnexion transport), juste un état
      // exposé à l'UI pour distinguer "en cours de connexion" d'un échec
      // (`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`) plutôt que de laisser le chat
      // paraître à jour alors que les messages des autres ne circulent plus.
      .subscribe((status) => {
        if (!isMountedRef.current) return;
        if (status === 'SUBSCRIBED') {
          setState((prev) => ({ ...prev, realtimeStatus: 'connected' }));
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setState((prev) => ({ ...prev, realtimeStatus: 'error' }));
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activityId, currentUserId, appendMessage]);

  const sendMessage = useCallback(
    async (body: string): Promise<boolean> => {
      if (!activityId || !currentUserId) return false;

      const { data, error } = await supabase
        .from('messages')
        .insert({ activity_id: activityId, user_id: currentUserId, body })
        .select('id, created_at')
        .single();

      if (error || !data) {
        return false;
      }

      appendMessage({
        id: data.id,
        userId: currentUserId,
        authorName: SELF_AUTHOR_LABEL,
        body,
        createdAt: data.created_at,
      });

      return true;
    },
    [activityId, currentUserId, appendMessage]
  );

  return { ...state, refetch: load, sendMessage };
}
