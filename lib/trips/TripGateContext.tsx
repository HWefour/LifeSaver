import { createContext, useContext } from 'react';

export type TripGateContextValue = {
  /**
   * Relance la vérification "l'utilisateur a-t-il un trip ?" utilisée par
   * l'auth-gate (app/_layout.tsx) pour décider entre `onboarding` et
   * `(tabs)`. À appeler juste après la création réussie du premier trip :
   * ça fait basculer le `guard` du `Stack.Protected` correspondant, et
   * expo-router redirige alors automatiquement vers `(tabs)` (même
   * mécanisme que la redirection automatique après connexion).
   *
   * Propage l'échec (`{ success: false }`) plutôt que de l'avaler : l'appelant
   * (onboarding.tsx) doit pouvoir afficher une erreur et proposer un retry
   * sans jamais relancer un nouvel insert de trip.
   */
  refetchHasTrip: () => Promise<{ success: boolean }>;
};

// Pont minimal entre l'instance de `useHasTrip` possédée par le layout racine
// (qui pilote le Stack.Protected) et l'écran onboarding, qui a besoin de la
// déclencher après insertion. Ce n'est pas un store d'état global générique :
// ne pas l'étendre pour d'autres usages sans discussion (cf. contrainte
// "pas de lib de state management globale").
export const TripGateContext = createContext<TripGateContextValue | null>(null);

export function useTripGate(): TripGateContextValue {
  const ctx = useContext(TripGateContext);
  if (!ctx) {
    throw new Error(
      'useTripGate() doit être utilisé sous TripGateContext.Provider (voir app/_layout.tsx).'
    );
  }
  return ctx;
}
