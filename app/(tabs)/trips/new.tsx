import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, View as RNView, StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { TripForm } from '@/components/trips/TripForm';
import { colors, fonts, spacing } from '@/constants/theme';

// Création d'un voyage supplémentaire (le premier est créé via
// app/onboarding.tsx, obligatoire avant d'accéder à (tabs)). Réutilise le
// même formulaire ; ici la création est optionnelle et on revient simplement
// à la liste des voyages une fois l'insert réussi (app/(tabs)/trips/index.tsx
// se rafraîchit au focus).
export default function NewTripScreen() {
  const router = useRouter();

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
        <Text style={styles.headerTitle}>Nouveau voyage</Text>
      </RNView>

      <RNView style={styles.content}>
        <TripForm submitLabel="Créer le voyage" onSuccess={() => router.back()} />
      </RNView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 19,
    color: colors.text,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
