import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

// Profil voyageur : nationalité, langues parlées, destination et dates de séjour.
export default function OnboardingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complétez votre profil</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
