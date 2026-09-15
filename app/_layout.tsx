import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  InstrumentSans_400Regular,
  InstrumentSans_500Medium,
  InstrumentSans_600SemiBold,
  InstrumentSans_700Bold,
} from '@expo-google-fonts/instrument-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/constants/theme';
import { useSession } from '@/lib/auth/useSession';
import { useNotificationNavigation } from '@/lib/notifications/useNotificationNavigation';
import { usePushRegistration } from '@/lib/notifications/usePushRegistration';
import { TripGateContext } from '@/lib/trips/TripGateContext';
import { useHasTrip } from '@/lib/trips/useHasTrip';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(auth)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    InstrumentSans_700Bold,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, isLoading: isSessionLoading } = useSession();
  const {
    hasTrip,
    isLoading: isTripLoading,
    refetch: refetchHasTrip,
  } = useHasTrip(session?.user.id);
  const theme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;

  usePushRegistration(session?.user.id);
  useNotificationNavigation();

  // On n'a besoin d'attendre la vérification du trip que si une session
  // existe : pas de flash d'écran incorrect, pas d'attente inutile sinon.
  const isGateLoading = isSessionLoading || (!!session && isTripLoading);

  if (isGateLoading) {
    return (
      <ThemeProvider value={theme}>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          lightColor={colors.bg}
          darkColor={colors.bg}>
          <Text lightColor={colors.text} darkColor={colors.text}>
            Chargement…
          </Text>
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <TripGateContext.Provider value={{ refetchHasTrip }}>
        {/* `contentStyle` sombre appliqué à toute la navigation : évite un flash
            clair pendant les transitions entre écrans, y compris avant que les
            écrans auth (non reskinnés pour l'instant) ne posent leur propre fond. */}
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!session && !hasTrip}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!!session && hasTrip}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      </TripGateContext.Provider>
    </ThemeProvider>
  );
}
