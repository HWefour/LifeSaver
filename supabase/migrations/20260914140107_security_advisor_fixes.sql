-- LifeSaver — corrections suite aux findings get_advisors (security + performance)
-- sur les deux migrations précédentes. Ne modifie pas les fichiers déjà
-- appliqués, ajoute uniquement les correctifs nécessaires.

-- ============================================================================
-- Sécurité — ERROR "rls_disabled_in_public" + WARN "extension_in_public"
-- (règle aussi 3 des 8 findings "SECURITY DEFINER function executable" par
-- anon/authenticated, qui concernent des fonctions internes de postgis comme
-- st_estimatedextent : elles quittent le schéma exposé avec l'extension)
-- ============================================================================

-- postgis était installée dans `public`, exposant sa table de référence
-- `spatial_ref_sys` (sans RLS) et ses fonctions internes au schéma exposé par
-- PostgREST.
--
-- `alter extension postgis set schema extensions;` échoue : PostGIS >= 2.3
-- n'est plus "relocatable" ("extension does not support SET SCHEMA"). Le
-- contournement documenté par Supabase pour ce cas
-- (https://supabase.com/docs/guides/database/extensions/postgis#troubleshooting)
-- via `UPDATE pg_extension SET extrelocatable = true ...` requiert un accès
-- superuser au catalogue système que le rôle utilisé ici n'a pas
-- ("permission denied for table pg_extension", vérifié).
--
-- On utilise donc la méthode self-service documentée par Supabase pour ce
-- même cas : DROP EXTENSION CASCADE, puis recréation dans le schéma
-- `extensions` (qui existe déjà par défaut sur ce projet et fait partie du
-- search_path : "$user", public, extensions — donc `geography`, `ST_*` etc.
-- restent utilisables sans préfixe côté requêtes normales).
--
-- Impact vérifié au préalable via une transaction annulée
-- (BEGIN; drop extension postgis cascade; ...; ROLLBACK;) : seules les deux
-- colonnes geography (trips.location, activities.location) et leurs index
-- GiST sont supprimées en cascade, aucune table n'est droppée. La base ne
-- contenant aucune ligne à ce stade (projet fraîchement créé), on recrée ces
-- colonnes/index immédiatement sans perte de données réelle.
--
-- Attention si cette migration est rejouée sur un environnement contenant
-- déjà des trips/activities : le DROP EXTENSION CASCADE supprimerait les
-- valeurs de location existantes (les colonnes sont recréées vides, sans
-- backfill). Sur un projet avec des données réelles, il faudrait sauvegarder
-- location (et location_label le cas échéant) avant cette migration et la
-- restaurer après, comme documenté par Supabase.
drop extension postgis cascade;
create extension postgis schema extensions;

alter table public.trips
  add column location extensions.geography(Point, 4326) not null;
create index trips_location_gix on public.trips using gist (location);

alter table public.activities
  add column location extensions.geography(Point, 4326) not null;
create index activities_location_gix on public.activities using gist (location);

-- ============================================================================
-- Sécurité — WARN "anon_security_definer_function_executable" /
-- "authenticated_security_definer_function_executable" (nos 5 fonctions)
-- ============================================================================

-- Supabase accorde EXECUTE directement aux rôles anon/authenticated/service_role
-- sur les fonctions du schéma public à leur création, indépendamment du
-- pseudo-rôle PUBLIC : le `revoke ... from public` de la migration précédente
-- ne suffisait donc pas à empêcher l'appel via /rest/v1/rpc/...

-- Fonctions trigger pures : jamais censées être appelées via l'API, quel que
-- soit le rôle. L'exécution via trigger ne dépend pas d'un grant EXECUTE du
-- rôle appelant sur la fonction.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_activity_capacity() from public, anon, authenticated;
revoke execute on function public.enforce_activity_capacity_on_update() from public, anon, authenticated;

-- RPC destinée aux utilisateurs connectés uniquement (agit sur auth.uid()) :
-- on retire l'accès anonyme, on garde authenticated.
revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

-- Fonction de rétention destinée à un job planifié tournant avec un rôle
-- privilégié (pg_cron / edge function), jamais via l'API cliente.
revoke execute on function public.cleanup_expired_data() from public, anon, authenticated;

-- ============================================================================
-- Performance — INFO "unindexed_foreign_keys" sur messages.user_id
-- ============================================================================

-- Utile en particulier pour delete_own_account(), qui fait un
-- `update messages set user_id = null where user_id = auth.uid()`.
create index messages_user_id_idx on public.messages (user_id);
