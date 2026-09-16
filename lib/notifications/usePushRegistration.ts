import Constants, { AppOwnership } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase/client';

/**
 * Enregistre le token de push Expo de l'appareil courant pour l'utilisateur
 * connecté (table `push_tokens`, RLS restreinte à `user_id = auth.uid()`).
 *
 * Ne fait rien sur simulateur/émulateur (pas de push possible) ni si la
 * permission est refusée. Best-effort : toute erreur (permission, token,
 * upsert) est avalée silencieusement — l'enregistrement du push token ne
 * doit jamais bloquer ou perturber le reste de l'app.
 *
 * Note infra : `getExpoPushTokenAsync` nécessite un `projectId` EAS
 * (`app.json` -> `expo.extra.eas.projectId`) pour fonctionner en dehors
 * d'Expo Go. Si absent, l'appel lève — on le catch et on log un simple
 * warning plutôt que de considérer ça comme un bug de ce hook.
 *
 * Depuis Expo SDK 53, `expo-notifications` lève une exception *à l'import
 * même* (pas seulement à l'appel d'une fonction précise) sur Android dans
 * Expo Go : son module racine charge un fichier d'effet
 * (`DevicePushTokenAutoRegistration.fx.js`) qui s'auto-exécute et throw dès
 * que le module est chargé. Un `import * as Notifications from
 * 'expo-notifications'` classique en haut de fichier est donc évalué (et
 * plante) dès que ce fichier est require, indépendamment de tout garde-fou
 * placé *à l'intérieur* du hook — c'est bien ce garde-fou-là qui était
 * insuffisant dans une version précédente. Seul un `import()` dynamique,
 * placé après avoir vérifié qu'on n'est pas dans Expo Go, reporte le
 * chargement du module (et donc l'exécution de son effet) à ce point précis
 * au lieu de l'exécuter immédiatement à l'évaluation du fichier.
 */
export function usePushRegistration(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;
    if (Constants.appOwnership === AppOwnership.Expo) return;

    let isCancelled = false;

    async function register() {
      if (!Device.isDevice) return;

      try {
        const Notifications: typeof NotificationsModule = await import('expo-notifications');

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );

        if (isCancelled) return;

        // `push_tokens` n'a pas de policy UPDATE côté backend (par design,
        // voir la migration `add_push_tokens.sql` : un token ne doit pas
        // changer de propriétaire par simple écrasement de ligne) — un
        // upsert `ON CONFLICT DO UPDATE` classique échouerait donc en RLS
        // dès que ce token existe déjà. `ignoreDuplicates: true` retombe sur
        // `ON CONFLICT DO NOTHING`, couvert par la seule policy INSERT : si
        // la ligne existe déjà pour ce token, no-op (cas normal d'un
        // utilisateur déjà enregistré), sinon insertion.
        const { error } = await supabase.from('push_tokens').upsert(
          {
            user_id: userId,
            expo_push_token: expoPushToken,
            platform: Platform.OS,
          },
          { onConflict: 'expo_push_token', ignoreDuplicates: true }
        );

        if (error) {
          console.warn('[usePushRegistration] upsert failed', error.message);
        }
      } catch (error) {
        // Cas attendu tant que `app.json` n'a pas de `extra.eas.projectId`
        // configuré (prérequis EAS, hors scope de ce hook), ou tout autre
        // souci de permission/token : on ne fait jamais planter l'app pour
        // un push token qui ne s'enregistre pas.
        console.warn('[usePushRegistration] registration failed', error);
      }
    }

    register();

    return () => {
      isCancelled = true;
    };
  }, [userId]);
}
