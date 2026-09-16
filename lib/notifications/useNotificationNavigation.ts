import Constants, { AppOwnership } from 'expo-constants';
import { useRouter } from 'expo-router';
import type * as NotificationsModule from 'expo-notifications';
import { useEffect } from 'react';

/**
 * Navigue vers le détail d'une activité quand l'utilisateur tape sur une
 * notification push dont le payload `data` contient `activityId` (voir
 * l'edge function `send-push-notifications`, événements `new_message` et
 * `participation_requested`).
 *
 * Depuis Expo SDK 53, `expo-notifications` lève une exception *à l'import
 * même* sur Android dans Expo Go (pas seulement à l'appel d'une fonction
 * précise) : son module racine charge un fichier d'effet
 * (`DevicePushTokenAutoRegistration.fx.js`) qui s'auto-exécute et throw dès
 * que le module est chargé — la fonctionnalité remote push y a été retirée,
 * seul un development build la supporte encore. Un `import * as Notifications
 * from 'expo-notifications'` classique en haut de fichier serait donc évalué
 * (et planterait, via l'ErrorBoundary global) dès que ce fichier est require,
 * *avant même* qu'un garde-fou à l'intérieur du hook ait la moindre chance de
 * s'exécuter — c'est cette distinction qui manquait dans une version
 * précédente de ce hook. Seul un `import()` dynamique, placé après avoir
 * vérifié qu'on n'est pas dans Expo Go, reporte le chargement du module (et
 * donc l'exécution de son effet) à ce point précis au lieu d'une évaluation
 * immédiate à l'import du fichier. `AppOwnership.Expo` (bien que dépréciée au
 * profit de `executionEnvironment`, qui lui ne distingue pas Expo Go d'un
 * development build) reste le moyen correct de détecter précisément "on
 * tourne dans Expo Go".
 */
export function useNotificationNavigation() {
  const router = useRouter();

  useEffect(() => {
    if (Constants.appOwnership === AppOwnership.Expo) return;

    let isCancelled = false;
    let subscription: NotificationsModule.EventSubscription | undefined;

    import('expo-notifications').then((Notifications) => {
      if (isCancelled) return;

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const activityId = response.notification.request.content.data?.activityId;

        if (typeof activityId === 'string' && activityId.length > 0) {
          router.push({ pathname: '/(tabs)/activities/[id]', params: { id: activityId } });
        }
      });
    });

    return () => {
      isCancelled = true;
      subscription?.remove();
    };
  }, [router]);
}
