@AGENTS.md

# LifeSaver

App mobile/web qui met en relation des voyageurs solo pour organiser des sorties et
activités ensemble pendant leurs voyages. Filtrage par nationalité, langue et dates de
séjour. Lancement sur **une seule ville pilote** — ne pas sur-ingénierier les features
de découverte/scale multi-villes avant validation de la demande.

## Stack
- Frontend : Expo (React Native + TypeScript), expo-router, react-native-maps
- Backend : Supabase (Postgres + PostGIS, Auth, Realtime, Storage)

## Structure
- `app/(auth)/` : sign-in, sign-up, onboarding (profil : nationalité, langues, dates
  de séjour, destination)
- `app/(tabs)/` : Découvrir (matching), Mes voyages, Publier une activité, Profil
- `components/` : composants partagés (voir `Themed.tsx` pour le thème clair/sombre)
- `types/models.ts` : types métier (miroir du schéma Supabase)
- `lib/` : clients et hooks de données (Supabase, Realtime) — à peupler à l'étape
  connexion Supabase
- `supabase/migrations/` : migrations SQL versionnées (créées par l'agent
  backend-supabase)

## Agents spécialisés (`.claude/agents/`)
- `backend-supabase` : schéma, migrations SQL, RLS, PostGIS, Auth/Realtime serveur
- `frontend-expo` : écrans, navigation, composants React Native
- `code-reviewer` : revue après chaque fonctionnalité conséquente
- `debugger` : diagnostic de bug/test qui échoue

## Modèle de données
`users`/`profiles`, `trips` (géré via colonne `geography` PostGIS), `activities`
(liée à un trip, visibilité filtrable par nationalité/langue), `participations`
(user <-> activity), `messages` (chat de groupe par activité, pas de 1-to-1 au MVP).
