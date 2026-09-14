import { StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Text, View } from '@/components/Themed';
import { colors, fonts } from '@/constants/theme';

// Détail d'une activité + chat de groupe (Supabase Realtime).
export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container} lightColor={colors.bg} darkColor={colors.bg}>
      <Text style={styles.title} lightColor={colors.text} darkColor={colors.text}>
        Sortie {id}
      </Text>
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
    fontFamily: fonts.heading,
    fontSize: 20,
  },
});
