import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import { ActivityCard } from '@/components/discover/ActivityCard';
import { EmptyState } from '@/components/discover/EmptyState';
import { FilterChip } from '@/components/discover/FilterChip';
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ORDER } from '@/constants/activityTypes';
import { colors, fonts, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { formatDateRangeChip } from '@/lib/activities/format';
import { useDiscoverFeed } from '@/lib/activities/useDiscoverFeed';
import { useActiveTrip } from '@/lib/trips/useActiveTrip';
import type { ActivityType } from '@/types/models';

// Feed "Découvrir" : croise lieu + dates + filtres (nationalité/langue déjà
// appliqués côté RLS, type d'activité côté client) pour afficher les
// activités compatibles avec le trip actif de l'utilisateur.
export default function DiscoverScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { trip, isLoading: isTripLoading } = useActiveTrip(session?.user.id);
  const [selectedTypes, setSelectedTypes] = useState<ActivityType[]>([]);

  const {
    activities,
    isLoading: isFeedLoading,
    error,
  } = useDiscoverFeed(trip?.startDate, trip?.endDate, selectedTypes);

  function toggleType(type: ActivityType) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function handleJoinPress(activityId: string) {
    // TODO: création de participation (`insert` dans `participations`) —
    // hors scope de cette tâche, qui ne couvre que l'affichage du feed.
    void activityId;
  }

  const isLoading = isTripLoading || isFeedLoading;

  return (
    <RNView style={styles.container}>
      <RNView style={styles.header}>
        <RNView style={styles.destinationBlock}>
          <Text style={styles.eyebrow}>Vous êtes à</Text>
          <RNView style={styles.destinationRow}>
            <Text style={styles.destination}>{trip?.destination ?? '…'}</Text>
            {trip ? (
              <SymbolView
                name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                tintColor={colors.lantern}
                size={16}
              />
            ) : null}
          </RNView>
        </RNView>

        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          data={ACTIVITY_TYPE_ORDER}
          keyExtractor={(type) => type}
          ListHeaderComponent={
            trip ? (
              <FilterChip label={formatDateRangeChip(trip.startDate, trip.endDate)} active />
            ) : null
          }
          ItemSeparatorComponent={() => <RNView style={{ width: spacing.sm }} />}
          renderItem={({ item }) => (
            <FilterChip
              label={ACTIVITY_TYPE_LABELS[item]}
              active={selectedTypes.includes(item)}
              onPress={() => toggleType(item)}
            />
          )}
        />
      </RNView>

      {isLoading ? (
        <RNView style={styles.centered}>
          <ActivityIndicator color={colors.lantern} />
        </RNView>
      ) : error ? (
        <RNView style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </RNView>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(activity) => activity.id}
          contentContainerStyle={
            activities.length === 0 ? styles.listEmptyContent : styles.listContent
          }
          ItemSeparatorComponent={() => <RNView style={{ height: spacing.md }} />}
          renderItem={({ item }) => (
            <ActivityCard
              activity={item}
              onPress={() =>
                router.push({ pathname: '/(tabs)/activities/[id]', params: { id: item.id } })
              }
              onJoinPress={() => handleJoinPress(item.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="Rien avec ces filtres"
              subtitle={
                selectedTypes.length > 0
                  ? "Aucune sortie de ce type sur votre séjour. Essayez d'élargir les filtres."
                  : "Aucune sortie ne correspond à votre séjour pour l'instant. Revenez plus tard ou publiez la vôtre."
              }
              actionLabel={selectedTypes.length > 0 ? 'Réinitialiser les filtres' : undefined}
              onActionPress={() => setSelectedTypes([])}
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
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  destinationBlock: {
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.textMuted,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  destination: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: colors.text,
    letterSpacing: -0.6,
  },
  chipsRow: {
    gap: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ember,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  listEmptyContent: {
    flexGrow: 1,
  },
});
