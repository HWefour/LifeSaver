import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function SignInScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connexion</Text>
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
