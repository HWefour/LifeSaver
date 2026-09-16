import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';

import { Text } from '@/components/Themed';
import { FilterChip } from '@/components/discover/FilterChip';
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_ORDER } from '@/constants/activityTypes';
import { colors, fonts, radii, spacing } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { toPointWkt } from '@/lib/geo/wkb';
import { supabase } from '@/lib/supabase/client';
import { useActiveTrip } from '@/lib/trips/useActiveTrip';
import type { ActivityType } from '@/types/models';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// Filet de sécurité si jamais `trip.location` ne se décode pas (ne devrait
// pas arriver : la colonne `trips.location` est NOT NULL et toujours écrite
// au même format WKT, voir `app/onboarding.tsx`). Même valeur que le
// placeholder d'onboarding, pour ne pas introduire un nouveau point arbitraire.
const FALLBACK_LOCATION = { lat: 0, lng: 0 };

/** "français, anglais" -> ['français', 'anglais'], ou `null` si vide (pas de filtre). */
function parseCommaList(input: string): string[] | null {
  const values = input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return values.length > 0 ? values : null;
}

// Formulaire de publication d'une sortie, rattachée au trip actif de
// l'utilisateur. Pas de géocodage réel côté MVP : le point de la sortie
// réutilise celui du trip parent (cf. `toPointWkt`/`useActiveTrip`), le
// point de rendez-vous "humain" reste un texte libre (`location_label`).
export default function CreateActivityScreen() {
  const router = useRouter();
  const { session } = useSession();
  const { trip, isLoading: isTripLoading } = useActiveTrip(session?.user.id);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ActivityType | null>(null);
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [spotsStr, setSpotsStr] = useState('');
  const [nationalitiesInput, setNationalitiesInput] = useState('');
  const [languagesInput, setLanguagesInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const spotsNumber = Number.parseInt(spotsStr, 10);
  const spotsValid = Number.isInteger(spotsNumber) && spotsNumber > 0;
  const datesLookValid = DATE_RE.test(dateStr) && TIME_RE.test(timeStr);

  const canSubmit =
    !!session &&
    !!trip &&
    title.trim().length > 0 &&
    !!type &&
    datesLookValid &&
    locationLabel.trim().length > 0 &&
    spotsValid &&
    !isSubmitting;

  async function handleSubmit() {
    if (!session || !trip || !type) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    const { data, error } = await supabase
      .from('activities')
      .insert({
        trip_id: trip.id,
        title: title.trim(),
        description: description.trim() || null,
        type,
        // Pas de fuseau horaire dédié au MVP mono-ville, même simplification
        // que `useDiscoverFeed` pour la fenêtre de dates du trip.
        date_time: `${dateStr}T${timeStr}:00`,
        location: toPointWkt(trip.location ?? FALLBACK_LOCATION),
        location_label: locationLabel.trim(),
        spots: spotsNumber,
        visibility_nationalities: parseCommaList(nationalitiesInput),
        visibility_languages: parseCommaList(languagesInput),
      })
      .select('id')
      .single();

    if (error || !data) {
      setIsSubmitting(false);
      setErrorMessage(error?.message ?? 'Impossible de publier cette sortie.');
      return;
    }

    router.replace({ pathname: '/(tabs)/activities/[id]', params: { id: data.id } });
  }

  if (isTripLoading) {
    return (
      <RNView style={styles.centered}>
        <ActivityIndicator color={colors.lantern} />
      </RNView>
    );
  }

  // Défensif : ne devrait pas arriver, l'auth-gate (app/_layout.tsx) redirige
  // vers l'onboarding tant qu'aucun trip n'existe pour cet utilisateur.
  if (!trip) {
    return (
      <RNView style={styles.centered}>
        <Text style={styles.errorText}>
          Aucun voyage actif trouvé. Renseignez d'abord votre séjour pour publier une sortie.
        </Text>
      </RNView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <RNView style={styles.header}>
        <Text style={styles.headerTitle}>Nouvelle sortie</Text>
        <Text style={styles.headerSubtitle}>{trip.destination}</Text>
      </RNView>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Ça consiste en quoi ?</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="ex. Apéro sur les rives du Ping"
          placeholderTextColor={colors.textFaint}
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Ajoutez deux phrases : ce qu'on fait, où on se retrouve, l'ambiance…"
          placeholderTextColor={colors.textFaint}
          multiline
          numberOfLines={4}
          maxLength={1000}
        />

        <Text style={styles.label}>Type d'activité</Text>
        <RNView style={styles.chipsWrap}>
          {ACTIVITY_TYPE_ORDER.map((t) => (
            <FilterChip
              key={t}
              label={ACTIVITY_TYPE_LABELS[t]}
              active={type === t}
              onPress={() => setType(t)}
            />
          ))}
        </RNView>

        <RNView style={styles.row}>
          <RNView style={styles.rowItem}>
            <Text style={styles.label}>Quand</Text>
            <TextInput
              style={styles.input}
              value={dateStr}
              onChangeText={setDateStr}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={colors.textFaint}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
            />
          </RNView>
          <RNView style={styles.rowItem}>
            <Text style={styles.label}>Heure</Text>
            <TextInput
              style={styles.input}
              value={timeStr}
              onChangeText={setTimeStr}
              placeholder="HH:MM"
              placeholderTextColor={colors.textFaint}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
            />
          </RNView>
        </RNView>

        <Text style={styles.label}>Point de rendez-vous</Text>
        <TextInput
          style={styles.input}
          value={locationLabel}
          onChangeText={setLocationLabel}
          placeholder="ex. Pont de fer, Nawarat"
          placeholderTextColor={colors.textFaint}
        />

        <Text style={styles.label}>Nombre de places</Text>
        <TextInput
          style={styles.input}
          value={spotsStr}
          onChangeText={setSpotsStr}
          placeholder="ex. 6"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Visible seulement par (optionnel)</Text>
        <TextInput
          style={styles.input}
          value={nationalitiesInput}
          onChangeText={setNationalitiesInput}
          placeholder="Nationalités, ex. Française, Belge"
          placeholderTextColor={colors.textFaint}
        />
        <TextInput
          style={styles.input}
          value={languagesInput}
          onChangeText={setLanguagesInput}
          placeholder="Langues, ex. français, anglais"
          placeholderTextColor={colors.textFaint}
        />
        <Text style={styles.hint}>
          Séparez les valeurs par une virgule. Laissez vide pour ne restreindre sur aucun critère.
        </Text>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </ScrollView>

      <RNView style={styles.footer}>
        <Pressable
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}>
          {isSubmitting ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.submitLabel}>Publier la sortie</Text>
          )}
        </Pressable>
      </RNView>
    </KeyboardAvoidingView>
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
  header: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.sm,
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
  textArea: {
    fontFamily: fonts.body,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowItem: {
    flex: 1,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ember,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  submitButton: {
    backgroundColor: colors.lantern,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.bg,
  },
});
