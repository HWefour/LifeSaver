import { FunctionsHttpError } from '@supabase/supabase-js';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View as RNView, StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { FilterChip } from '@/components/discover/FilterChip';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { VERIFICATION_STATUS_COLORS, VERIFICATION_STATUS_LABELS } from '@/constants/verification';
import { useSession } from '@/lib/auth/useSession';
import { formatDateRangeChip, getAvatarGradient, getInitials } from '@/lib/activities/format';
import { useOwnProfile } from '@/lib/profile/useOwnProfile';
import { useProfileStats } from '@/lib/profile/useProfileStats';
import { supabase } from '@/lib/supabase/client';
import { useActiveTrip } from '@/lib/trips/useActiveTrip';

const DEFAULT_DELETE_ACCOUNT_ERROR =
  'Impossible de supprimer votre compte pour le moment. Réessayez plus tard.';

// `supabase.functions.invoke` renvoie `{ data: null, error }` sur toute
// réponse non-2xx. Une `FunctionsHttpError` porte la `Response` brute dans
// `error.context` : on essaie d'en extraire le `{ error: "..." }` renvoyé par
// la edge function pour afficher son message générique plutôt qu'un texte
// généré côté client. `FunctionsRelayError`/`FunctionsFetchError` (échec
// réseau avant même d'atteindre la fonction) n'ont pas ce corps structuré, on
// retombe alors sur le message par défaut.
async function extractDeleteAccountErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === 'string' && body.error.length > 0) {
        return body.error;
      }
    } catch {
      // Corps non-JSON ou illisible : on retombe sur le message par défaut.
    }
  }

  return DEFAULT_DELETE_ACCOUNT_ERROR;
}

// Écran Profil : identité (avatar initiales, nom, nationalité), statut de
// vérification, langues parlées, statistiques simples, voyage actif, et les
// deux actions de compte (déconnexion, suppression RGPD). Pas de flux de
// vérification ni d'édition de profil ici — affichage honnête de l'état
// actuel uniquement (voir constants/verification.ts).
export default function ProfileScreen() {
  const { session } = useSession();
  const userId = session?.user.id;

  const { profile, isLoading: isProfileLoading } = useOwnProfile(userId);
  const { stats } = useProfileStats(userId);
  const { trip } = useActiveTrip(userId);

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSignOut() {
    await supabase.auth.signOut();
    // Succès : `useSession` capte le changement et l'auth-gate dans
    // app/_layout.tsx redirige automatiquement vers (auth).
  }

  function handleDeleteAccountPress() {
    Alert.alert(
      'Supprimer votre compte ?',
      "Cette action est définitive et irréversible : votre compte sera entièrement supprimé et vous ne pourrez plus vous reconnecter avec cet email. Votre profil sera supprimé. Vos messages resteront visibles pour les autres participants mais anonymisés (votre nom disparaît). Vos voyages et sorties ne seront pas supprimés immédiatement : ils seront détachés de votre compte, puis nettoyés automatiquement plus tard.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer mon compte', style: 'destructive', onPress: confirmDeleteAccount },
      ]
    );
  }

  async function confirmDeleteAccount() {
    setDeleteError(null);
    setIsDeleting(true);

    const { error } = await supabase.functions.invoke('delete-account');

    if (error) {
      setIsDeleting(false);
      setDeleteError(await extractDeleteAccountErrorMessage(error));
      return;
    }

    // Suppression réussie : la ligne auth.users est désormais réellement
    // supprimée côté serveur. Le token en mémoire correspond à un compte qui
    // n'existe plus ; on déconnecte uniquement pour nettoyer la session
    // locale, pas pour "espérer" que ça règle quoi que ce soit côté données.
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setIsDeleting(false);
      setDeleteError(
        'Votre compte a été supprimé, mais la déconnexion a échoué. Réessayez de vous déconnecter.'
      );
    }
  }

  if (isProfileLoading || !profile) {
    return (
      <RNView style={styles.centered}>
        <ActivityIndicator color={colors.lantern} />
      </RNView>
    );
  }

  const [gradientStart, gradientEnd] = getAvatarGradient(userId ?? profile.displayName);
  const verificationLabel = VERIFICATION_STATUS_LABELS[profile.verificationStatus];
  const verificationColor = VERIFICATION_STATUS_COLORS[profile.verificationStatus];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <RNView style={styles.identity}>
        <LinearGradient
          colors={[gradientStart, gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}>
          <Text style={styles.avatarLabel}>{getInitials(profile.displayName)}</Text>
        </LinearGradient>
        <Text style={styles.displayName}>{profile.displayName}</Text>
        <Text style={styles.nationality}>{profile.nationality}</Text>

        <RNView style={[styles.verificationBadge, { borderColor: verificationColor }]}>
          <RNView style={[styles.verificationDot, { backgroundColor: verificationColor }]} />
          <Text style={[styles.verificationLabel, { color: verificationColor }]}>
            {verificationLabel}
          </Text>
        </RNView>
      </RNView>

      {profile.languages.length > 0 ? (
        <RNView style={styles.section}>
          <Text style={styles.sectionTitle}>Langues parlées</Text>
          <RNView style={styles.chipsWrap}>
            {profile.languages.map((language) => (
              <FilterChip key={language} label={language} />
            ))}
          </RNView>
        </RNView>
      ) : null}

      <RNView style={styles.statsRow}>
        <RNView style={styles.statCard}>
          <Text style={styles.statValue}>{stats ? stats.activitiesOrganized : '—'}</Text>
          <Text style={styles.statLabel}>Sorties organisées</Text>
        </RNView>
        <RNView style={styles.statCard}>
          <Text style={styles.statValue}>{stats ? stats.confirmedParticipations : '—'}</Text>
          <Text style={styles.statLabel}>Participations confirmées</Text>
        </RNView>
      </RNView>

      <RNView style={styles.section}>
        <Text style={styles.sectionTitle}>Voyage en cours</Text>
        {trip ? (
          <RNView style={styles.tripCard}>
            <Text style={styles.tripDestination}>{trip.destination}</Text>
            <Text style={styles.tripDates}>{formatDateRangeChip(trip.startDate, trip.endDate)}</Text>
          </RNView>
        ) : (
          <Text style={styles.emptyTripText}>Aucun voyage actif pour l'instant.</Text>
        )}
      </RNView>

      {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}

      <RNView style={styles.actions}>
        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutLabel}>Se déconnecter</Text>
        </Pressable>

        <Pressable
          style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
          onPress={handleDeleteAccountPress}
          disabled={isDeleting}>
          {isDeleting ? (
            <ActivityIndicator color={colors.ember} />
          ) : (
            <Text style={styles.deleteLabel}>Supprimer mon compte</Text>
          )}
        </Pressable>
      </RNView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 26,
    color: colors.bg,
  },
  displayName: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.text,
  },
  nationality: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textMuted,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: spacing.sm,
  },
  verificationDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  verificationLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.lantern,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  tripCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  tripDestination: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.text,
  },
  tripDates: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  emptyTripText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textFaint,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ember,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  signOutButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  signOutLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.ember,
    borderRadius: radii.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.ember,
  },
});
