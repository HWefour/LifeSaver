import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { colors, fonts } from '@/constants/theme';

export default function CreateActivityScreen() {
  return (
    <View style={styles.container} lightColor={colors.bg} darkColor={colors.bg}>
      <Text style={styles.title} lightColor={colors.text} darkColor={colors.text}>
        Publier une sortie
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
