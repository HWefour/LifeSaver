import { Link } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { Text, View } from '@/components/Themed';
import { supabase } from '@/lib/supabase/client';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nationality, setNationality] = useState('');
  const [languagesInput, setLanguagesInput] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    nationality.trim().length > 0 &&
    privacyAccepted &&
    !isSubmitting;

  async function handleSignUp() {
    setErrorMessage(null);
    setInfoMessage(null);
    setIsSubmitting(true);

    const languages = languagesInput
      .split(',')
      .map((lang) => lang.trim())
      .filter((lang) => lang.length > 0);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          nationality: nationality.trim(),
          languages,
          privacy_accepted: true,
        },
      },
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    // Selon la config Supabase (confirmation email activée ou non), on peut soit
    // avoir une session immédiate (-> redirigée automatiquement par l'auth-gate),
    // soit devoir confirmer l'email avant de pouvoir se connecter.
    if (!data.session) {
      // Avec la confirmation email activée, signUp() sur un email déjà
      // enregistré ET déjà confirmé ne renvoie pas d'erreur : `identities`
      // est un tableau vide (aucune nouvelle identité créée) et `session` est
      // null, exactement comme pour une vraie nouvelle inscription en attente
      // de confirmation. On distingue les deux cas via `identities`, sans
      // révéler explicitement qu'un compte existe déjà (énumération de comptes).
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setInfoMessage('Si un compte existe déjà avec cet email, connectez-vous plutôt.');
      } else {
        setInfoMessage('Compte créé ! Vérifiez votre boîte mail pour confirmer votre adresse.');
      }
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Créer un compte</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="vous@example.com"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoComplete="password-new"
          secureTextEntry
          placeholder="6 caractères minimum"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Nationalité</Text>
        <TextInput
          style={styles.input}
          value={nationality}
          onChangeText={setNationality}
          placeholder="ex. Française"
          placeholderTextColor="#999"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Langues parlées</Text>
        <TextInput
          style={styles.input}
          value={languagesInput}
          onChangeText={setLanguagesInput}
          placeholder="ex. français, anglais"
          placeholderTextColor="#999"
        />
        <Text style={styles.hint}>Séparez les langues par une virgule.</Text>
      </View>

      <Pressable
        style={styles.checkboxRow}
        onPress={() => setPrivacyAccepted((prev) => !prev)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: privacyAccepted }}>
        <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
          {privacyAccepted ? <Text style={styles.checkboxMark}>✓</Text> : null}
        </View>
        <Text style={styles.checkboxLabel}>
          J&apos;accepte la politique de confidentialité et le traitement de mes données.
        </Text>
      </Pressable>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {infoMessage ? <Text style={styles.info}>{infoMessage}</Text> : null}

      <Pressable
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={!canSubmit}>
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Créer mon compte</Text>
        )}
      </Pressable>

      <Link href="/(auth)/sign-in" asChild>
        <Pressable>
          <Text style={styles.link}>Déjà un compte ? Se connecter</Text>
        </Pressable>
      </Link>
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
    marginBottom: 8,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    opacity: 0.6,
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2f95dc',
    borderColor: '#2f95dc',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
  },
  error: {
    color: '#d00',
  },
  info: {
    color: '#2f95dc',
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
  link: {
    textAlign: 'center',
    marginTop: 8,
    textDecorationLine: 'underline',
  },
});
