import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import { ACTIVITY_TYPE_COLORS, ACTIVITY_TYPE_LABELS } from '@/constants/activityTypes';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { formatActivityDateTimeFull } from '@/lib/activities/format';
import { useActivityDetail } from '@/lib/activities/useActivityDetail';
import { supabase } from '@/lib/supabase/client';

// Détail d'une activité. L'accès au chat de groupe (écran dédié
// `[id]/chat.tsx`, Supabase Realtime) n'est proposé que si l'utilisateur a
// le droit d'y écrire/lire selon la RLS de `messages` (participant confirmé
// ou propriétaire) — voir la maquette "6. CHAT" pour le détail visuel.
export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();

  const {
    activity,
    ownParticipation,
    isLoading,
    error,
    refetch,
  } = useActivityDetail(id, session?.user.id);

  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Verrou synchrone en plus du state `isActing` : un state React ne se
  // reflète qu'au prochain rendu, donc deux taps rapprochés avant ce rendu
  // peuvent tous les deux passer le `disabled` du bouton et entrer ici avec
  // `ownParticipation` encore à sa valeur précédente (les deux emprunteraient
  // alors la branche `insert`, le second échouant sur la contrainte unique
  // (activity_id, user_id)). Le ref, lui, est mis à jour immédiatement.
  const isActingRef = useRef(false);

  async function handleJoinPress() {
    if (!session || !activity || isActingRef.current) return;

    isActingRef.current = true;
    setActionError(null);
    setIsActing(true);

    // Une demande 'declined' ne peut pas être ré-insérée (contrainte unique
    // (activity_id, user_id)) : il faut la faire repasser à 'requested' via
    // update, seule transition self-service autorisée par
    // `participations_update_self` (voir la migration initiale).
    const result =
      ownParticipation && ownParticipation.status === 'declined'
        ? await supabase
            .from('participations')
            .update({ status: 'requested' })
            .eq('id', ownParticipation.id)
        : await supabase
            .from('participations')
            .insert({ activity_id: activity.id, user_id: session.user.id });

    isActingRef.current = false;
    setIsActing(false);

    if (result.error) {
      // Le trigger `enforce_activity_capacity` lève une exception Postgres
      // brute ("activity % is full") : on l'intercepte pour afficher un
      // message présentable plutôt que le message serveur tel quel.
      const message = result.error.message ?? '';
      setActionError(
        message.toLowerCase().includes('is full')
          ? 'Cette sortie est complète.'
          : "Impossible de rejoindre cette sortie pour l'instant. Réessayez."
      );
      return;
    }

    refetch();
  }

  if (isLoading) {
    return (
      <RNView style={styles.centered}>
        <ActivityIndicator color={colors.lantern} />
      </RNView>
    );
  }

  if (error || !activity) {
    return (
      <RNView style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Cette sortie est introuvable.'}</Text>
      </RNView>
    );
  }

  const spotsLeft = Math.max(activity.spots - activity.spotsTaken, 0);
  const spotsLabel = spotsLeft <= 0 ? 'Complet' : spotsLeft === 1 ? '1 place restante' : `${spotsLeft} places restantes`;
  const spotsColor = spotsLeft <= 1 ? colors.ember : colors.jade;
  const typeColor = ACTIVITY_TYPE_COLORS[activity.type];
  const isOwner = !!session && !!activity.tripOwnerId && session.user.id === activity.tripOwnerId;

  const canAccessChat = isOwner || ownParticipation?.status === 'confirmed';

  const organizerLine = activity.organizer
    ? activity.organizer.languages.length > 0
      ? `${activity.organizer.nationality} · parle ${activity.organizer.languages.join(', ')}`
      : activity.organizer.nationality
    : null;

  return (
    <RNView style={styles.container}>
      <RNView style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            tintColor={colors.text}
            size={20}
          />
        </Pressable>

        {canAccessChat ? (
          <Pressable
            style={styles.chatButton}
            hitSlop={8}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/activities/[id]/chat',
                params: { id: activity.id, title: activity.title },
              })
            }>
            <SymbolView
              name={{ ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' }}
              tintColor={colors.lantern}
              size={17}
            />
            <Text style={styles.chatButtonLabel}>Discussion</Text>
          </Pressable>
        ) : null}
      </RNView>

      <ScrollView contentContainerStyle={styles.content}>
        <RNView style={styles.tags}>
          <RNView style={[styles.tag, { backgroundColor: `${typeColor}24` }]}>
            <Text style={[styles.tagLabel, { color: typeColor }]}>
              {ACTIVITY_TYPE_LABELS[activity.type]}
            </Text>
          </RNView>
          <RNView style={[styles.tag, { backgroundColor: `${spotsColor}24` }]}>
            <Text style={[styles.tagLabel, { color: spotsColor }]}>{spotsLabel}</Text>
          </RNView>
        </RNView>

        <Text style={styles.title}>{activity.title}</Text>

        <RNView style={styles.metaRow}>
          <RNView style={styles.metaIcon}>
            <SymbolView
              name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
              tintColor={colors.lantern}
              size={17}
            />
          </RNView>
          <Text style={styles.metaText}>{formatActivityDateTimeFull(activity.dateTime)}</Text>
        </RNView>

        <RNView style={styles.metaRow}>
          <RNView style={styles.metaIcon}>
            <SymbolView
              name={{ ios: 'mappin.and.ellipse', android: 'place', web: 'place' }}
              tintColor={colors.lantern}
              size={17}
            />
          </RNView>
          <Text style={styles.metaText}>{activity.locationLabel}</Text>
        </RNView>

        {activity.description ? (
          <Text style={styles.description}>{activity.description}</Text>
        ) : null}

        <RNView style={styles.organizerCard}>
          <RNView style={styles.organizerAvatar}>
            <Text style={styles.organizerInitials}>
              {(activity.organizer?.displayName ?? '??').trim().slice(0, 2).toUpperCase()}
            </Text>
          </RNView>
          <RNView style={styles.organizerInfo}>
            <Text style={styles.organizerName}>{activity.organizer?.displayName ?? 'Voyageur'}</Text>
            {organizerLine ? <Text style={styles.organizerMeta}>{organizerLine}</Text> : null}
          </RNView>
        </RNView>

        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
      </ScrollView>

      <RNView style={styles.footer}>
        {isOwner ? (
          <RNView style={styles.ownerBanner}>
            <Text style={styles.ownerLabel}>C'est votre sortie</Text>
          </RNView>
        ) : ownParticipation?.status === 'confirmed' ? (
          <RNView style={[styles.statusButton, styles.statusButtonConfirmed]}>
            <Text style={styles.statusLabel}>Vous participez</Text>
          </RNView>
        ) : ownParticipation?.status === 'requested' ? (
          <RNView style={styles.statusButton}>
            <Text style={styles.statusLabelMuted}>Demande envoyée</Text>
          </RNView>
        ) : (
          <Pressable
            style={[styles.joinButton, (isActing || spotsLeft <= 0) && styles.joinButtonDisabled]}
            onPress={handleJoinPress}
            disabled={isActing || spotsLeft <= 0}>
            {isActing ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.joinLabel}>{spotsLeft <= 0 ? 'Complet' : 'Rejoindre'}</Text>
            )}
          </Pressable>
        )}
      </RNView>
    </RNView>
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
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: `${colors.lantern}1F`,
    borderWidth: 1,
    borderColor: `${colors.lantern}4D`,
    borderRadius: radii.full,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chatButtonLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.lantern,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  tags: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tag: {
    borderRadius: radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tagLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: colors.text,
    lineHeight: 31,
    letterSpacing: -0.6,
    marginBottom: spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metaIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 24,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  organizerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  organizerAvatar: {
    width: 46,
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.lantern,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizerInitials: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.bg,
  },
  organizerInfo: {
    flex: 1,
  },
  organizerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
  },
  organizerMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ember,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  joinButton: {
    backgroundColor: colors.lantern,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.bg,
  },
  statusButton: {
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusButtonConfirmed: {
    backgroundColor: `${colors.jade}24`,
    borderColor: colors.jade,
  },
  statusLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.jade,
  },
  statusLabelMuted: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.textMuted,
  },
  ownerBanner: {
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ownerLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.textMuted,
  },
});
