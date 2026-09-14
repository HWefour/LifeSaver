import { colors } from '@/constants/theme';
import type { ActivityType } from '@/types/models';

// Libellés FR pour les types d'activité (`activities.type` en base), cohérents
// avec le vocabulaire de la maquette Wayfinder ("Street food", "Nature"...).
export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  food: 'Street food',
  sightseeing: 'Visite',
  nightlife: 'Soirée',
  outdoor: 'Nature',
  other: 'Autre',
};

export const ACTIVITY_TYPE_ORDER: ActivityType[] = [
  'food',
  'sightseeing',
  'nightlife',
  'outdoor',
  'other',
];

// Couleur d'accent par type, reprise de la palette de tags de la maquette
// (ex. "Street food" en iris, "Nature" en jade).
export const ACTIVITY_TYPE_COLORS: Record<ActivityType, string> = {
  food: colors.iris,
  sightseeing: colors.lantern,
  nightlife: colors.ember,
  outdoor: colors.jade,
  other: colors.textMuted,
};
