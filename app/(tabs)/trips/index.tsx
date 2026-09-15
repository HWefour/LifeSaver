import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, View as RNView, StyleSheet } from 'react-native';

import { Text } from '@/components/Themed';
import { EmptyState } from '@/components/discover/EmptyState';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { formatDateRangeChip } from '@/lib/activities/format';
import { useUserTrips, type UserTrip } from '@/lib/trips/useUserTrips';

export default function TripsScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { trips, isLoading, refetch } = useUserTrips(session?.user.id);

  // Rafraîchit la liste au retour de l'écran de création (app/(tabs)/trips/new.tsx) :
  // pas de state partagé entre les deux écrans, un simple refetch au focus suffit.
  useFocusEffect(
    useCallback(() => {
      refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user.id])
  );

  function renderTrip({ item }: { item: UserTrip }) {
    const activitiesLabel =
      item.activitiesCount === 0
        ? 'Aucune sortie publiée'
        : item.activitiesCount === 1
          ? '1 sortie publiée'
          : `${item.activitiesCount} sorties publiées`;

    return (
      <RNView style={styles.card}>
        <Text style={styles.destination}>{item.destination}</Text>
        <Text style={styles.dates}>{formatDateRangeChip(item.startDate, item.endDate)}</Text>
        <RNView style={styles.badge}>
          <Text style={styles.badgeLabel}>{activitiesLabel}</Text>
        </RNView>
      </RNView>
    );
  }

  return (
    <RNView style={styles.container}>
      <RNView style={styles.header}>
        <Text style={styles.headerTitle}>Mes voyages</Text>
        <Pressable
          style={styles.newTripButton}
          hitSlop={8}
          onPress={() => router.push('/(tabs)/trips/new')}>
          <SymbolView
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            tintColor={colors.bg}
            size={16}
          />
          <Text style={styles.newTripLabel}>Nouveau voyage</Text>
        </Pressable>
      </RNView>

      {isLoading ? (
        <RNView style={styles.centered}>
          <ActivityIndicator color={colors.lantern} />
        </RNView>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(trip) => trip.id}
          contentContainerStyle={trips.length === 0 ? styles.listEmptyContent : styles.listContent}
          ItemSeparatorComponent={() => <RNView style={{ height: spacing.md }} />}
          renderItem={renderTrip}
          ListEmptyComponent={
            <EmptyState
              title="Aucun voyage pour l'instant"
              subtitle="Ajoutez un voyage pour découvrir des sorties et en publier sur place."
              actionLabel="Nouveau voyage"
              onActionPress={() => router.push('/(tabs)/trips/new')}
            />
          }
        />
      )}
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
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.6,
  },
  newTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.lantern,
    borderRadius: radii.full,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  newTripLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  listEmptyContent: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  destination: {
    fontFamily: fonts.heading,
    fontSize: 19,
    color: colors.text,
  },
  dates: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.jade}24`,
    borderRadius: radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: spacing.xs,
  },
  badgeLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.jade,
  },
});
