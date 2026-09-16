import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import { ACTIVITY_TYPE_COLORS, ACTIVITY_TYPE_LABELS } from '@/constants/activityTypes';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { formatActivityDateTimeFull } from '@/lib/activities/format';
import { useActivityDetail } from '@/lib/activities/useActivityDetail';
import { useActivityRatings } from '@/lib/activities/useActivityRatings';
import { useConfirmedParticipants } from '@/lib/activities/useConfirmedParticipants';
import { useParticipationRequests } from '@/lib/activities/useParticipationRequests';
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

  // Calculé avant les `return` anticipés ci-dessous : `useParticipationRequests`
  // est un hook et doit être appelé inconditionnellement à chaque rendu, y
  // compris pendant le chargement initial (où `activity` est encore `null`).
  const isOwner = !!session && !!activity?.tripOwnerId && session.user.id === activity.tripOwnerId;

  const {
    requests: pendingRequests,
    isLoading: isLoadingRequests,
    error: requestsError,
    actingIds: actingRequestIds,
    confirm: confirmRequest,
    decline: declineRequest,
  } = useParticipationRequests(activity?.id, isOwner);

  // Accès chat/participants/notation : mêmes règles que canAccessChat
  // (propriétaire ou participant confirmé), calculé ici pour être disponible
  // avant les `return` anticipés (hooks appelés inconditionnellement).
  const canAccessGroup = isOwner || ownParticipation?.status === 'confirmed';

  const {
    participants: confirmedParticipants,
    isLoading: isLoadingParticipants,
    refetch: refetchParticipants,
  } = useConfirmedParticipants(activity?.id, canAccessGroup);

  const isPastActivity = !!activity && new Date(activity.dateTime).getTime() < Date.now();

  const {
    ratedUserIds,
    submittingUserId: ratingSubmittingUserId,
    error: ratingError,
    rate: rateParticipant,
  } = useActivityRatings(activity?.id, session?.user.id, canAccessGroup && isPastActivity);

  // Un blocage posé depuis la fiche profil publique (`[id]/user/[userId].tsx`,
  // ouverte via `router.push` depuis cet écran) doit se refléter ici au retour
  // (participant bloqué qui disparaît de la liste) sans attendre un démontage
  // complet de l'écran — même pattern que `app/(tabs)/trips/index.tsx`.
  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchParticipants();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activity?.id])
  );

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
    const isReactivation = !!ownParticipation && ownParticipation.status === 'declined';

    const result = isReactivation
      ? await supabase
          .from('participations')
          .update({ status: 'requested' })
          .eq('id', ownParticipation.id)
      : await supabase
          .from('participations')
          .insert({ activity_id: activity.id, user_id: session.user.id })
          .select('id')
          .single();

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

    // Notification best-effort à l'organisateur, uniquement pour une
    // nouvelle demande (pas une réactivation depuis 'declined').
    if (!isReactivation) {
      const participationId = (result.data as { id: string } | null)?.id;
      if (participationId) {
        // `invoke` ne throw que sur un échec réseau/invocation — une réponse
        // HTTP non-2xx de la fonction revient dans `{ error }` sans lever.
        try {
          const { error } = await supabase.functions.invoke('send-push-notifications', {
            body: { event: 'participation_requested', participation_id: participationId },
          });
          if (error) {
            console.warn('[ActivityDetail] send-push-notifications returned an error', error);
          }
        } catch (error) {
          console.warn('[ActivityDetail] send-push-notifications failed', error);
        }
      }
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

  const canAccessChat = canAccessGroup;

  // `activity` est garanti non-null ici (return anticipé plus haut dans la
  // même portée de fonction), mais TypeScript ne propage pas ce narrowing
  // dans une closure imbriquée — d'où l'assertion non-null.
  function goToProfile(userId: string) {
    router.push({
      pathname: '/(tabs)/activities/[id]/user/[userId]',
      params: { id: activity!.id, userId },
    });
  }

  async function handleRequestResponse(participationId: string, status: 'confirmed' | 'declined') {
    if (status === 'confirmed') {
      await confirmRequest(participationId);
    } else {
      await declineRequest(participationId);
    }
    // Le nombre de places prises (`spotsTaken`) ne bouge qu'à la confirmation,
    // mais on refetch dans les deux cas pour rester simple.
    refetch();
  }

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

        <Pressable
          style={styles.organizerCard}
          disabled={!activity.tripOwnerId || isOwner}
          onPress={() => goToProfile(activity.tripOwnerId!)}>
          <RNView style={styles.organizerAvatar}>
            <Text style={styles.organizerInitials}>
              {(activity.organizer?.displayName ?? '??').trim().slice(0, 2).toUpperCase()}
            </Text>
          </RNView>
          <RNView style={styles.organizerInfo}>
            <Text style={styles.organizerName}>{activity.organizer?.displayName ?? 'Voyageur'}</Text>
            {organizerLine ? <Text style={styles.organizerMeta}>{organizerLine}</Text> : null}
          </RNView>
        </Pressable>

        {canAccessGroup && (confirmedParticipants.length > 0 || isLoadingParticipants) ? (
          <RNView style={styles.requestsSection}>
            <Text style={styles.requestsTitle}>
              Participants confirmés{confirmedParticipants.length > 0 ? ` (${confirmedParticipants.length})` : ''}
            </Text>

            {ratingError ? <Text style={styles.errorText}>{ratingError}</Text> : null}

            {isLoadingParticipants && confirmedParticipants.length === 0 ? (
              <ActivityIndicator color={colors.lantern} style={styles.requestsLoading} />
            ) : (
              confirmedParticipants.map((participant) => {
                const isSelf = participant.userId === session?.user.id;
                const participantLine =
                  participant.languages.length > 0
                    ? `${participant.nationality} · parle ${participant.languages.join(', ')}`
                    : participant.nationality;
                const alreadyRated = ratedUserIds.has(participant.userId);
                const isRatingSubmitting = ratingSubmittingUserId === participant.userId;

                return (
                  <RNView key={participant.userId} style={styles.requestRow}>
                    <Pressable
                      style={styles.participantTouchable}
                      onPress={() => goToProfile(participant.userId)}>
                      <RNView style={styles.requestAvatar}>
                        <Text style={styles.requestInitials}>
                          {participant.displayName.trim().slice(0, 2).toUpperCase()}
                        </Text>
                      </RNView>
                      <RNView style={styles.requestInfo}>
                        <Text style={styles.requestName}>{participant.displayName}</Text>
                        {participantLine ? (
                          <Text style={styles.requestMeta}>{participantLine}</Text>
                        ) : null}
                      </RNView>
                    </Pressable>

                    {isPastActivity && !isSelf ? (
                      alreadyRated ? (
                        <Text style={styles.ratedLabel}>Noté ✓</Text>
                      ) : isRatingSubmitting ? (
                        <ActivityIndicator size="small" color={colors.lantern} />
                      ) : (
                        <RNView style={styles.starsRow}>
                          {[1, 2, 3, 4, 5].map((score) => (
                            <Pressable
                              key={score}
                              hitSlop={4}
                              onPress={() => rateParticipant(participant.userId, score)}>
                              <SymbolView
                                name={{ ios: 'star', android: 'star_border', web: 'star_border' }}
                                tintColor={colors.lantern}
                                size={16}
                              />
                            </Pressable>
                          ))}
                        </RNView>
                      )
                    ) : null}
                  </RNView>
                );
              })
            )}
          </RNView>
        ) : null}

        {isOwner && (pendingRequests.length > 0 || isLoadingRequests) ? (
          <RNView style={styles.requestsSection}>
            <Text style={styles.requestsTitle}>
              Demandes en attente{pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
            </Text>

            {requestsError ? <Text style={styles.errorText}>{requestsError}</Text> : null}

            {isLoadingRequests && pendingRequests.length === 0 ? (
              <ActivityIndicator color={colors.lantern} style={styles.requestsLoading} />
            ) : (
              pendingRequests.map((request) => {
                const isRequestActing = actingRequestIds.has(request.id);
                const requestLine =
                  request.languages.length > 0
                    ? `${request.nationality} · parle ${request.languages.join(', ')}`
                    : request.nationality;

                return (
                  <RNView key={request.id} style={styles.requestRow}>
                    <RNView style={styles.requestAvatar}>
                      <Text style={styles.requestInitials}>
                        {request.displayName.trim().slice(0, 2).toUpperCase()}
                      </Text>
                    </RNView>
                    <RNView style={styles.requestInfo}>
                      <Text style={styles.requestName}>{request.displayName}</Text>
                      {requestLine ? <Text style={styles.requestMeta}>{requestLine}</Text> : null}
                    </RNView>
                    <RNView style={styles.requestActions}>
                      <Pressable
                        hitSlop={8}
                        disabled={isRequestActing}
                        style={[styles.requestButton, styles.requestButtonDecline]}
                        onPress={() => handleRequestResponse(request.id, 'declined')}>
                        <SymbolView
                          name={{ ios: 'xmark', android: 'close', web: 'close' }}
                          tintColor={colors.ember}
                          size={16}
                        />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        disabled={isRequestActing}
                        style={[styles.requestButton, styles.requestButtonConfirm]}
                        onPress={() => handleRequestResponse(request.id, 'confirmed')}>
                        {isRequestActing ? (
                          <ActivityIndicator size="small" color={colors.bg} />
                        ) : (
                          <SymbolView
                            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                            tintColor={colors.bg}
                            size={16}
                          />
                        )}
                      </Pressable>
                    </RNView>
                  </RNView>
                );
              })
            )}
          </RNView>
        ) : null}

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
  requestsSection: {
    marginTop: spacing.xl,
  },
  requestsTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  requestsLoading: {
    marginTop: spacing.sm,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  requestAvatar: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.lantern,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestInitials: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.bg,
  },
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  requestMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  participantTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  starsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ratedLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.jade,
  },
  requestButton: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestButtonDecline: {
    backgroundColor: `${colors.ember}1F`,
    borderWidth: 1,
    borderColor: `${colors.ember}4D`,
  },
  requestButtonConfirm: {
    backgroundColor: colors.jade,
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
