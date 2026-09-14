import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { colors, fonts, radii, spacing } from '@/constants/theme';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

/** Chip de filtre façon maquette : plein "lanterne" si actif, contour sinon. */
export function FilterChip({ label, active, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!active } : undefined}>
      <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radii.full,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  chipActive: {
    backgroundColor: colors.lantern,
  },
  chipInactive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },
  labelActive: {
    color: colors.bg,
  },
  labelInactive: {
    color: colors.textMuted,
  },
});

export const filterRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
