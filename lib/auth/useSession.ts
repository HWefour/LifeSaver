import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export type UseSessionResult = {
  session: Session | null;
  isLoading: boolean;
};

/**
 * Expose la session Supabase courante et se tient à jour via
 * `onAuthStateChange` (connexion, déconnexion, refresh de token...).
 * Source de vérité unique pour savoir si l'utilisateur est authentifié.
 */
export function useSession(): UseSessionResult {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, isLoading };
}
