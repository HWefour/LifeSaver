import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import { ACTIVITY_TYPE_COLORS, ACTIVITY_TYPE_LABELS } from '@/constants/activityTypes';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { formatActivityTimeBadge, getAvatarGradient, getInitials } from '@/lib/activities/format';
import type { DiscoverActivity } from '@/lib/activities/useDiscoverFeed';

type Props = {
  activity: DiscoverActivity;
  onPress?: () => void;
  onJoinPress?: () => void;
};

export function ActivityCard({ activity, onPress, onJoinPress }: Props) {
  const spotsLeft = Math.max(activity.spots - activity.spotsTaken, 0);
  const spotsLabel = spotsLeft <= 0 ? 'Complet' : spotsLeft === 1 ? '1 place' : `${spotsLeft} places`;
  const spotsColor = spotsLeft <= 1 ? colors.ember : colors.jade;
  const typeColor = ACTIVITY_TYPE_COLORS[activity.type];
  const [gradientStart, gradientEnd] = getAvatarGradient(activity.id);

  const organizerLine = activity.organizer
    ? activity.organizer.languages.length > 0
      ? `${activity.organizer.displayName}, ${activity.organizer.nationality} · parle ${activity.organizer.languages.join(', ')}`
      : `${activity.organizer.displayName}, ${activity.organizer.nationality}`
    : 'Voyageur';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <RNView style={styles.header}>
        <RNView style={styles.headerText}>
          <Text style={styles.timeBadge}>{formatActivityTimeBadge(activity.dateTime)}</Text>
          <Text style={styles.title}>{activity.title}</Text>
        </RNView>
        <LinearGradient
          colors={[gradientStart, gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}>
          <Text style={styles.avatarLabel}>
            {getInitials(activity.organizer?.displayName ?? '?')}
          </Text>
        </LinearGradient>
      </RNView>

      <Text style={styles.organizerLine} numberOfLines={1}>
        {organizerLine}
      </Text>

      <RNView style={styles.footer}>
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
        <Pressable
          hitSlop={8}
          disabled={spotsLeft <= 0}
          onPress={(event) => {
            event.stopPropagation();
            onJoinPress?.();
          }}>
          <Text style={[styles.joinLabel, spotsLeft <= 0 && styles.joinLabelDisabled]}>
            Rejoindre
          </Text>
        </Pressable>
      </RNView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 5,
  },
  timeBadge: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.lantern,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 19,
    color: colors.text,
    lineHeight: 23,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.bg,
  },
  organizerLine: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tags: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  joinLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.lantern,
  },
  joinLabelDisabled: {
    color: colors.textFaint,
  },
});
