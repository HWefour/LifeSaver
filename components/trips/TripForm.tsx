import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View as RNView } from 'react-native';

import { Text } from '@/components/Themed';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { toPointWkt } from '@/lib/geo/wkb';
import { supabase } from '@/lib/supabase/client';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// `trips.location` (geography Point) est NOT NULL en base et le MVP ne fait
// pas de géocodage réel de la destination saisie en texte libre : on insère
// un point (0, 0) temporaire pour satisfaire la contrainte, plutôt que de
// bloquer la création du trip sur une feature de géocodage hors scope ici.
// À remplacer par un vrai géocodage (ou des coordonnées fixes de la ville
// pilote) quand ce sera priorisé.
const PLACEHOLDER_LOCATION = { lat: 0, lng: 0 };

export type TripFormProps = {
  /** Libellé du bouton de soumission (par défaut "Continuer"). */
  submitLabel?: string;
  /** Appelé après un insert réussi, avec l'id du trip créé. */
  onSuccess: (tripId: string) => void;
};

/**
 * Formulaire de création d'un voyage (destination + dates de séjour),
 * partagé entre `app/onboarding.tsx` (premier voyage, obligatoire) et
 * `app/(tabs)/trips/new.tsx` (voyages suivants, optionnels). Ne gère que la
 * saisie + l'insert `trips` lui-même : l'orchestration post-succès (garde
 * d'onboarding vs. simple retour à la liste) reste du ressort de l'appelant,
 * via `onSuccess`.
 */
export function TripForm({ submitLabel = 'Continuer', onSuccess }: TripFormProps) {
  const { session } = useSession();

  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const datesLookValid = DATE_RE.test(startDate) && DATE_RE.test(endDate);
  const datesOrdered = datesLookValid && endDate >= startDate;
  const canSubmit =
    destination.trim().length > 0 && datesOrdered && !isSubmitting && !!session;

  async function handleSubmit() {
    if (!session) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    const { data, error } = await supabase
      .from('trips')
      .insert({
        user_id: session.user.id,
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        location: toPointWkt(PLACEHOLDER_LOCATION),
      })
      .select('id')
      .single();

    if (error || !data) {
      setIsSubmitting(false);

      // Violation de clé étrangère Postgres (`trips.user_id` -> `profiles.id`) :
      // arrive si le compte a été supprimé (delete_own_account()) puis
      // l'utilisateur s'est reconnecté avec les mêmes identifiants (auth.users
      // existe toujours, limite connue du RPC) — son user_id ne référence plus
      // aucun profil, l'insert ne peut jamais aboutir. On casse la boucle en
      // déconnectant plutôt que de laisser l'utilisateur réessayer indéfiniment
      // sur un formulaire qui ne peut pas réussir.
      if (error?.code === '23503') {
        setErrorMessage("Ce compte n'existe plus. Contactez le support.");
        await supabase.auth.signOut();
        return;
      }

      setErrorMessage(error?.message ?? "Impossible d'enregistrer ce voyage.");
      return;
    }

    setIsSubmitting(false);
    onSuccess(data.id);
  }

  return (
    <RNView style={styles.form}>
      <RNView style={styles.field}>
        <Text style={styles.label}>Destination</Text>
        <TextInput
          style={styles.input}
          value={destination}
          onChangeText={setDestination}
          placeholder="ex. Lisbonne"
          placeholderTextColor={colors.textFaint}
        />
      </RNView>

      <RNView style={styles.field}>
        <Text style={styles.label}>Date d'arrivée</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor={colors.textFaint}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
        />
      </RNView>

      <RNView style={styles.field}>
        <Text style={styles.label}>Date de départ</Text>
        <TextInput
          style={styles.input}
          value={endDate}
          onChangeText={setEndDate}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor={colors.textFaint}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
        />
        {datesLookValid && !datesOrdered ? (
          <Text style={styles.error}>La date de départ doit être après la date d'arrivée.</Text>
        ) : null}
      </RNView>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}>
        {isSubmitting ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.buttonText}>{submitLabel}</Text>
        )}
      </Pressable>
    </RNView>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.ember,
  },
  button: {
    backgroundColor: colors.lantern,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.bg,
  },
});
