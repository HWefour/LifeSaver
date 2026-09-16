import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import { TripForm } from '@/components/trips/TripForm';
import { colors, fonts, spacing } from '@/constants/theme';
import { useTripGate } from '@/lib/trips/TripGateContext';

// Complète le profil voyageur : destination + dates de séjour (le premier
// `trip`). La nationalité/langues/consentement sont déjà couverts par
// sign-up. Cet écran n'est atteint que pour un utilisateur authentifié sans
// trip existant (cf. auth-gate dans app/_layout.tsx).
export default function OnboardingScreen() {
  const { refetchHasTrip } = useTripGate();

  // Verrou définitif une fois l'insert du trip réussi (cf. TripForm) :
  // empêche un double insert si le refetch de la garde qui suit échoue et que
  // l'utilisateur retente (il n'y a pas de contrainte unique sur
  // trips.user_id en base).
  const [tripCreated, setTripCreated] = useState(false);
  const [isRetryingGate, setIsRetryingGate] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  async function runRefetch() {
    setGateError(null);
    setIsRetryingGate(true);

    // Fait basculer le `guard` `hasTrip` dans app/_layout.tsx : Stack.Protected
    // redirige alors automatiquement vers (tabs), comme après une connexion.
    const { success } = await refetchHasTrip();

    setIsRetryingGate(false);

    if (!success) {
      setGateError(
        'Votre séjour a été enregistré, mais une erreur est survenue pour continuer — réessayez.'
      );
    }
  }

  async function handleTripCreated() {
    // Insert réussi : on verrouille l'écran immédiatement, que le refetch de
    // la garde ci-dessous réussisse ou non — jamais de second insert depuis
    // cet écran (TripForm est démonté une fois `tripCreated` à `true`).
    setTripCreated(true);
    await runRefetch();
  }

  return (
    <RNView style={styles.container}>
      <Text style={styles.title}>Votre séjour</Text>
      <Text style={styles.subtitle}>
        Destination et dates de séjour, pour vous proposer les bonnes rencontres.
      </Text>

      {tripCreated ? (
        gateError ? (
          <>
            <Text style={styles.error}>{gateError}</Text>
            <Pressable
              style={[styles.button, isRetryingGate && styles.buttonDisabled]}
              onPress={runRefetch}
              disabled={isRetryingGate}>
              {isRetryingGate ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.buttonText}>Réessayer</Text>
              )}
            </Pressable>
          </>
        ) : (
          <RNView style={styles.center}>
            <ActivityIndicator color={colors.lantern} />
            <Text style={styles.loadingText}>Enregistrement de votre séjour…</Text>
          </RNView>
        )
      ) : (
        <TripForm onSuccess={handleTripCreated} />
      )}
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ember,
  },
  center: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  button: {
    backgroundColor: colors.lantern,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: fonts.bodyBold,
    color: colors.bg,
    fontSize: 16,
  },
});
