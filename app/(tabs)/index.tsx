import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

// Trips et activités compatibles à proximité (lieu + dates + filtres nationalité/langue).
export default function DiscoverScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Découvrir</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});
