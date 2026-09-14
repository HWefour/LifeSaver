import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useSession } from '@/lib/auth/useSession';
import { supabase } from '@/lib/supabase/client';
import { useTripGate } from '@/lib/trips/TripGateContext';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// `trips.location` (geography Point) est NOT NULL en base et le MVP ne fait
// pas de géocodage réel de la destination saisie en texte libre : on insère
// un point (0, 0) temporaire pour satisfaire la contrainte, plutôt que de
// bloquer la création du trip sur une feature de géocodage hors scope ici.
// À remplacer par un vrai géocodage (ou des coordonnées fixes de la ville
// pilote) quand ce sera priorisé.
const PLACEHOLDER_LOCATION = { lat: 0, lng: 0 };

// Complète le profil voyageur : destination + dates de séjour (le premier
// `trip`). La nationalité/langues/consentement sont déjà couverts par
// sign-up. Cet écran n'est atteint que pour un utilisateur authentifié sans
// trip existant (cf. auth-gate dans app/_layout.tsx).
export default function OnboardingScreen() {
  const { session } = useSession();
  const { refetchHasTrip } = useTripGate();

  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Verrou définitif une fois l'insert du trip réussi : empêche un double
  // insert si le refetch de la garde qui suit échoue et que l'utilisateur
  // retente (il n'y a pas de contrainte unique sur trips.user_id en base).
  const [tripCreated, setTripCreated] = useState(false);
  const [isRetryingGate, setIsRetryingGate] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const datesLookValid = DATE_RE.test(startDate) && DATE_RE.test(endDate);
  const datesOrdered = datesLookValid && endDate >= startDate;
  const canSubmit =
    destination.trim().length > 0 && datesOrdered && !isSubmitting && !!session && !tripCreated;

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

  async function handleSubmit() {
    if (!session) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    const { error } = await supabase.from('trips').insert({
      user_id: session.user.id,
      destination: destination.trim(),
      start_date: startDate,
      end_date: endDate,
      location: `POINT(${PLACEHOLDER_LOCATION.lng} ${PLACEHOLDER_LOCATION.lat})`,
    });

    if (error) {
      setIsSubmitting(false);
      setErrorMessage(error.message);
      return;
    }

    // Insert réussi : on verrouille le formulaire immédiatement, que le
    // refetch de la garde ci-dessous réussisse ou non — jamais de second
    // insert depuis cet écran.
    setTripCreated(true);
    setIsSubmitting(false);

    await runRefetch();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Votre séjour</Text>
      <Text style={styles.subtitle}>
        Destination et dates de séjour, pour vous proposer les bonnes rencontres.
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Destination</Text>
        <TextInput
          style={styles.input}
          value={destination}
          onChangeText={setDestination}
          placeholder="ex. Lisbonne"
          placeholderTextColor="#999"
          editable={!tripCreated}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Date d'arrivée</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor="#999"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          editable={!tripCreated}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Date de départ</Text>
        <TextInput
          style={styles.input}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor="#999"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          editable={!tripCreated}
        />
        {datesLookValid && !datesOrdered ? (
          <Text style={styles.error}>La date de départ doit être après la date d'arrivée.</Text>
        ) : null}
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {tripCreated ? (
        gateError ? (
          <>
            <Text style={styles.error}>{gateError}</Text>
            <Pressable
              style={[styles.button, isRetryingGate && styles.buttonDisabled]}
              onPress={runRefetch}
              disabled={isRetryingGate}>
              {isRetryingGate ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Réessayer</Text>
              )}
            </Pressable>
          </>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text>Enregistrement de votre séjour…</Text>
          </View>
        )
      ) : (
        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}>
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continuer</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#000',
  },
  error: {
    color: '#d00',
  },
  center: {
    alignItems: 'center',
    gap: 8,
  },
  button: {
    backgroundColor: '#2f95dc',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
