import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';

import { Text } from '@/components/Themed';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { useBlockUser } from '@/lib/profile/useBlockUser';
import { usePublicProfile } from '@/lib/profile/usePublicProfile';
import { REPORT_REASON_LABELS, useReportUser } from '@/lib/profile/useReportUser';
import type { ReportReason } from '@/types/models';

const REPORT_REASONS: ReportReason[] = [
  'inappropriate_behavior',
  'fake_profile',
  'harassment',
  'spam',
  'other',
];

// Profil public d'un autre utilisateur, ouvert depuis la fiche organisateur,
// la liste des participants confirmés ou le chat d'une activité (voir
// `[id]/index.tsx` et `[id]/chat.tsx`). Imbriqué sous `activities/[id]/`
// plutôt qu'en route top-level pour rester dans le sous-arbre navigable de
// l'onglet "Publier" sans introduire un nouveau segment top-level (qui
// apparaîtrait comme un onglet supplémentaire non désiré dans la tab bar) et
// pour garder `activityId` disponible en contexte pour le signalement.
export default function PublicProfileScreen() {
  const { id: activityId, userId } = useLocalSearchParams<{ id: string; userId: string }>();
  const router = useRouter();
  const { session } = useSession();
  const currentUserId = session?.user.id;

  const { profile, isLoading, error } = usePublicProfile(userId);
  const {
    isBlocked,
    isToggling,
    isLoading: isLoadingBlock,
    error: blockError,
    toggleBlock,
  } = useBlockUser(currentUserId, userId);
  const { submit: submitReport, isSubmitting: isSubmittingReport, error: reportError } =
    useReportUser(currentUserId, userId);

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ReportReason>('inappropriate_behavior');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const isSelf = !!currentUserId && currentUserId === userId;

  function handleBlockPress() {
    if (isBlocked) {
      Alert.alert('Débloquer cette personne ?', 'Vous reverrez ses sorties et pourrez à nouveau échanger avec elle.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Débloquer', onPress: () => toggleBlock() },
      ]);
      return;
    }

    Alert.alert(
      'Bloquer cette personne ?',
      "Vous ne verrez plus ses sorties, ses messages ni son profil, et elle ne pourra plus vous contacter.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Bloquer', style: 'destructive', onPress: () => toggleBlock() },
      ]
    );
  }

  async function handleSubmitReport() {
    const ok = await submitReport(selectedReason, reportDetails, activityId);
    if (ok) {
      setReportSent(true);
      setReportDetails('');
    }
  }

  function closeReportModal() {
    setIsReportModalOpen(false);
    setReportSent(false);
  }

  if (isLoading) {
    return (
      <RNView style={styles.centered}>
        <ActivityIndicator color={colors.lantern} />
      </RNView>
    );
  }

  if (error || !profile) {
    // `error` signale un vrai échec réseau/serveur (message actionnable :
    // "réessayez"). `!profile` sans `error` recouvre volontairement deux cas
    // indistinguables côté UI — profil inexistant, ou masqué par un blocage
    // réciproque (RLS `profiles_select_authenticated`) — pour ne jamais
    // révéler à un utilisateur qu'il a été bloqué (voir `usePublicProfile`).
    return (
      <RNView style={styles.centered}>
        <Pressable style={styles.backFloating} hitSlop={12} onPress={() => router.back()}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            tintColor={colors.text}
            size={20}
          />
        </Pressable>
        <Text style={styles.errorText}>
          {error ? 'Impossible de charger ce profil. Réessayez.' : 'Ce profil est introuvable.'}
        </Text>
      </RNView>
    );
  }

  const profileLine =
    profile.languages.length > 0
      ? `${profile.nationality} · parle ${profile.languages.join(', ')}`
      : profile.nationality;

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
      </RNView>

      <ScrollView contentContainerStyle={styles.content}>
        <RNView style={styles.avatar}>
          <Text style={styles.avatarInitials}>
            {profile.displayName.trim().slice(0, 2).toUpperCase()}
          </Text>
        </RNView>

        <Text style={styles.name}>{profile.displayName}</Text>
        <Text style={styles.meta}>{profileLine}</Text>

        {profile.verificationStatus === 'verified' ? (
          <RNView style={styles.verifiedTag}>
            <SymbolView
              name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }}
              tintColor={colors.jade}
              size={14}
            />
            <Text style={styles.verifiedLabel}>Profil vérifié</Text>
          </RNView>
        ) : null}

        <RNView style={styles.ratingRow}>
          <SymbolView
            name={{ ios: 'star.fill', android: 'star', web: 'star' }}
            tintColor={colors.lantern}
            size={16}
          />
          <Text style={styles.ratingText}>
            {profile.averageScore !== null
              ? `${profile.averageScore.toFixed(1)} · ${profile.ratingsCount} avis`
              : 'Pas encore noté'}
          </Text>
        </RNView>

        {!isSelf ? (
          <RNView style={styles.actions}>
            <Pressable
              style={styles.reportButton}
              onPress={() => setIsReportModalOpen(true)}>
              <SymbolView
                name={{ ios: 'flag', android: 'flag', web: 'flag' }}
                tintColor={colors.textMuted}
                size={16}
              />
              <Text style={styles.reportLabel}>Signaler</Text>
            </Pressable>

            <Pressable
              style={[styles.blockButton, isBlocked && styles.blockButtonActive]}
              disabled={isLoadingBlock || isToggling}
              onPress={handleBlockPress}>
              {isToggling ? (
                <ActivityIndicator size="small" color={isBlocked ? colors.bg : colors.ember} />
              ) : (
                <Text style={[styles.blockLabel, isBlocked && styles.blockLabelActive]}>
                  {isBlocked ? 'Débloquer' : 'Bloquer'}
                </Text>
              )}
            </Pressable>
          </RNView>
        ) : null}

        {blockError ? <Text style={styles.errorText}>{blockError}</Text> : null}
      </ScrollView>

      <Modal visible={isReportModalOpen} animationType="slide" transparent onRequestClose={closeReportModal}>
        <RNView style={styles.modalOverlay}>
          <RNView style={styles.modalCard}>
            {reportSent ? (
              <>
                <Text style={styles.modalTitle}>Signalement envoyé</Text>
                <Text style={styles.modalSubtitle}>
                  Merci, notre équipe va l'examiner.
                </Text>
                <Pressable style={styles.modalPrimaryButton} onPress={closeReportModal}>
                  <Text style={styles.modalPrimaryLabel}>Fermer</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Signaler {profile.displayName}</Text>

                {REPORT_REASONS.map((reason) => (
                  <Pressable
                    key={reason}
                    style={styles.reasonRow}
                    onPress={() => setSelectedReason(reason)}>
                    <RNView
                      style={[styles.radio, selectedReason === reason && styles.radioSelected]}
                    />
                    <Text style={styles.reasonLabel}>{REPORT_REASON_LABELS[reason]}</Text>
                  </Pressable>
                ))}

                <TextInput
                  style={styles.detailsInput}
                  placeholder="Détails (optionnel)"
                  placeholderTextColor={colors.textFaint}
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  multiline
                />

                {reportError ? <Text style={styles.errorText}>{reportError}</Text> : null}

                <Pressable
                  style={[styles.modalPrimaryButton, isSubmittingReport && styles.modalButtonDisabled]}
                  disabled={isSubmittingReport}
                  onPress={handleSubmitReport}>
                  {isSubmittingReport ? (
                    <ActivityIndicator color={colors.bg} />
                  ) : (
                    <Text style={styles.modalPrimaryLabel}>Envoyer le signalement</Text>
                  )}
                </Pressable>

                <Pressable style={styles.modalSecondaryButton} onPress={closeReportModal}>
                  <Text style={styles.modalSecondaryLabel}>Annuler</Text>
                </Pressable>
              </>
            )}
          </RNView>
        </RNView>
      </Modal>
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
  backFloating: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.lg,
  },
  header: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: radii.xl,
    backgroundColor: colors.lantern,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarInitials: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    color: colors.bg,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  verifiedLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.jade,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  ratingText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.full,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
  blockButton: {
    borderRadius: radii.full,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: `${colors.ember}4D`,
    backgroundColor: `${colors.ember}1F`,
    minWidth: 92,
    alignItems: 'center',
  },
  blockButtonActive: {
    backgroundColor: colors.ember,
    borderColor: colors.ember,
  },
  blockLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.ember,
  },
  blockLabelActive: {
    color: colors.bg,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ember,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: 19,
    color: colors.text,
    marginBottom: spacing.md,
  },
  modalSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: radii.full,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioSelected: {
    borderColor: colors.lantern,
    backgroundColor: colors.lantern,
  },
  reasonLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  detailsInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  modalPrimaryButton: {
    backgroundColor: colors.lantern,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalPrimaryLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.bg,
  },
  modalSecondaryButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalSecondaryLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textMuted,
  },
});
