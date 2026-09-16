import Constants, { AppOwnership } from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

/**
 * Navigue vers le détail d'une activité quand l'utilisateur tape sur une
 * notification push dont le payload `data` contient `activityId` (voir
 * l'edge function `send-push-notifications`, événements `new_message` et
 * `participation_requested`).
 *
 * Depuis Expo SDK 53, `expo-notifications` lève une exception *synchrone*
 * (pas une simple rejection catchable) dès qu'on touche à une API liée aux
 * notifications remote dans Expo Go — la fonctionnalité y a été retirée,
 * seul un development build la supporte encore. Cette exception, levée
 * directement dans le corps du `useEffect` (donc pendant le rendu, pas dans
 * un callback async comme `usePushRegistration`), fait planter toute l'app
 * via l'ErrorBoundary global si on ne s'y soustrait pas explicitement.
 * `AppOwnership.Expo` (bien que dépréciée au profit de `executionEnvironment`,
 * qui ne distingue lui pas Expo Go d'un development build) reste le moyen
 * correct de détecter précisément "on tourne dans Expo Go".
 */
export function useNotificationNavigation() {
  const router = useRouter();

  useEffect(() => {
    if (Constants.appOwnership === AppOwnership.Expo) return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const activityId = response.notification.request.content.data?.activityId;

      if (typeof activityId === 'string' && activityId.length > 0) {
        router.push({ pathname: '/(tabs)/activities/[id]', params: { id: activityId } });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [router]);
}
