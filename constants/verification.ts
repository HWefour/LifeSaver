import { colors } from '@/constants/theme';
import type { VerificationStatus } from '@/types/models';

// Libellés/couleurs FR pour `profiles.verification_status`. Affichage honnête
// de l'état actuel uniquement — pas de flux de vérification à construire ici.
export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  unverified: 'Non vérifié',
  pending: 'Vérification en cours',
  verified: 'Profil vérifié',
};

export const VERIFICATION_STATUS_COLORS: Record<VerificationStatus, string> = {
  unverified: colors.textFaint,
  pending: colors.lantern,
  verified: colors.jade,
};
