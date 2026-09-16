import { Pressable, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import { colors, fonts, radii, spacing } from '@/constants/theme';

type Props = {
  title: string;
  subtitle: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

/** État vide façon maquette "3. FEED VIDE" : cercle en pointillés + message. */
export function EmptyState({ title, subtitle, actionLabel, onActionPress }: Props) {
  return (
    <RNView style={styles.container}>
      <RNView style={styles.circleOuter}>
        <RNView style={styles.circleInner}>
          <Text style={styles.icon}>🧭</Text>
        </RNView>
      </RNView>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {actionLabel ? (
        <Pressable style={styles.actionButton} onPress={onActionPress}>
          <Text style={styles.actionLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  circleOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  circleInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 290,
    marginBottom: spacing.xl,
  },
  actionButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  actionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
});
