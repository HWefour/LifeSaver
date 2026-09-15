import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import type { ReportReason } from '@/types/models';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  inappropriate_behavior: 'Comportement inapproprié',
  fake_profile: 'Faux profil',
  harassment: 'Harcèlement',
  spam: 'Spam',
  other: 'Autre',
};

/**
 * Soumission d'un signalement (`reports`). `activityId` est optionnel : un
 * signalement peut être fait depuis une fiche activité (organisateur,
 * participant) ou, à terme, depuis un autre contexte sans activité associée.
 */
export function useReportUser(reporterId: string | undefined, reportedUserId: string | undefined) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (reason: ReportReason, details: string, activityId?: string): Promise<boolean> => {
      if (!reporterId || !reportedUserId) return false;

      setIsSubmitting(true);
      setError(null);

      const { error: insertError } = await supabase.from('reports').insert({
        reporter_id: reporterId,
        reported_user_id: reportedUserId,
        activity_id: activityId ?? null,
        reason,
        details: details.trim() || null,
      });

      setIsSubmitting(false);

      if (insertError) {
        setError("Le signalement n'a pas pu être envoyé. Réessayez.");
        return false;
      }

      return true;
    },
    [reporterId, reportedUserId]
  );

  return { submit, isSubmitting, error };
}
