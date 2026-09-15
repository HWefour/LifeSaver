import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

/**
 * Navigue vers le détail d'une activité quand l'utilisateur tape sur une
 * notification push dont le payload `data` contient `activityId` (voir
 * l'edge function `send-push-notifications`, événements `new_message` et
 * `participation_requested`).
 */
export function useNotificationNavigation() {
  const router = useRouter();

  useEffect(() => {
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
