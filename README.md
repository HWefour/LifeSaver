# LifeSaver

App mobile/web qui met en relation des voyageurs solo pour organiser des sorties et
activités ensemble pendant leurs voyages, avec un filtrage par nationalité, langue et
dates de séjour. MVP concentré sur une seule ville pilote.

## Stack

- **Frontend** : [Expo](https://docs.expo.dev/) (React Native + TypeScript),
  [expo-router](https://docs.expo.dev/router/introduction/), react-native-maps
- **Backend** : [Supabase](https://supabase.com/docs) (Postgres + PostGIS, Auth,
  Realtime, Storage)

## Structure du projet

```
app/
  (auth)/            sign-in, sign-up, onboarding (profil voyageur)
  (tabs)/            Découvrir (matching), Mes voyages, Publier, Profil
    activities/      publication + détail d'une activité (chat de groupe)
components/          composants partagés (thème clair/sombre inclus)
constants/           couleurs, constantes de config
types/models.ts      types métier (miroir du schéma Supabase)
lib/                 clients et hooks de données (Supabase, Realtime)
supabase/migrations/ migrations SQL versionnées
```

## Démarrer

```bash
npm install
npm run start     # puis choisir ios / android / web
```

## Agents Claude Code

Le dossier `.claude/agents/` contient des agents spécialisés pour ce projet :
`backend-supabase` (schéma/RLS/SQL), `frontend-expo` (écrans/composants),
`code-reviewer` (revue après feature) et `debugger` (diagnostic de bug).
