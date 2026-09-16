-- Ajoute public.messages à la publication supabase_realtime pour que le chat
-- de groupe par activité (app/(tabs)/...) puisse s'abonner aux nouveaux
-- messages via postgres_changes (INSERT).
--
-- Sécurité : les souscriptions Realtime postgres_changes sont filtrées par
-- les policies RLS existantes sur la table (comportement par défaut des
-- projets Supabase récents — confirmé via la doc Realtime "Postgres
-- Changes" : la Quick Start active RLS puis souscrit directement aux
-- changements, sans mécanisme d'autorisation séparé pour ce canal). Un user
-- ne recevra donc en direct que les messages couverts par
-- `messages_select_confirmed_or_owner` (participant confirmé de l'activité,
-- ou propriétaire du trip/activité) — aucune policy supplémentaire n'est
-- nécessaire ici.

alter publication supabase_realtime add table public.messages;
