import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useSession } from '@/lib/auth/useSession';
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

  // On n'a besoin d'attendre la vérification du trip que si une session
  // existe : pas de flash d'écran incorrect, pas d'attente inutile sinon.
  const isGateLoading = isSessionLoading || (!!session && isTripLoading);

  if (isGateLoading) {
    return (
      <ThemeProvider value={theme}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>Chargement…</Text>
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <TripGateContext.Provider value={{ refetchHasTrip }}>
        <Stack>
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
