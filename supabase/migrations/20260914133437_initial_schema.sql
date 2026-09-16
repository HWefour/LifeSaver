-- LifeSaver — schéma initial (MVP, une seule ville pilote)
-- Tables : profiles, trips, activities, participations, messages
-- RLS activée table par table, dès la création (jamais en tâche séparée).

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists postgis;

-- ============================================================================
-- profiles
-- Miroir de auth.users. La ligne est créée par le trigger handle_new_user()
-- (voir migration suivante) au moment de l'inscription : nationality,
-- languages et le consentement RGPD (privacy_accepted_at) doivent donc être
-- fournis dans raw_user_meta_data lors de l'appel à auth.signUp(), sans quoi
-- l'inscription échoue (voir commentaire détaillé sur le trigger).
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nationality text not null,
  languages text[] not null,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified')),
  -- Horodatage du consentement CGU / politique de confidentialité. Obligatoire :
  -- il n'existe pas de profil valide sans ce consentement (cf. trigger d'inscription).
  privacy_accepted_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Lecture ouverte à tout utilisateur authentifié : nécessaire pour évaluer le
-- profil d'un organisateur/participant avant de rejoindre une sortie. Ce n'est
-- pas un `using (true)` par défaut négligent, c'est un choix produit explicite,
-- restreint au rôle `authenticated` (les visiteurs anonymes ne voient rien).
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- Pas de policy INSERT : la création de profil passe exclusivement par le
-- trigger handle_new_user() (SECURITY DEFINER, bypass RLS) sur auth.users,
-- qui est le seul chemin garantissant le consentement RGPD
-- (privacy_accepted_at). Une policy INSERT "auth.uid() = id" laisserait un
-- utilisateur recréer son profil avec un consentement auto-déclaré après
-- avoir supprimé son compte via delete_own_account() (son JWT reste valide
-- tant que auth.users n'est pas supprimé).

create policy "profiles_update_self"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Pas de policy DELETE : la suppression passe exclusivement par la RPC
-- SECURITY DEFINER `delete_own_account()` (voir migration suivante), qui
-- encapsule l'anonymisation des messages avant la suppression du profil.

-- ============================================================================
-- trips
-- ============================================================================

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + ON DELETE SET NULL (pas CASCADE) : si le propriétaire supprime
  -- son compte (delete_own_account), le trip est détaché plutôt que supprimé,
  -- pour ne pas emporter en cascade les activities/messages qui appartiennent
  -- aux autres participants (cf. RGPD — droit à l'effacement). Le trip devient
  -- orphelin (plus personne ne peut le modifier) et sera nettoyé par le job de
  -- rétention à 12 mois s'il est ancien.
  user_id uuid references public.profiles (id) on delete set null,
  destination text not null,
  -- Niveau ville/quartier (cohérent avec le MVP mono-ville), pas une adresse précise.
  location geography(Point, 4326) not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint trips_end_after_start check (end_date >= start_date)
);

alter table public.trips enable row level security;

create index trips_location_gix on public.trips using gist (location);
create index trips_user_id_idx on public.trips (user_id);

-- Produit de découverte : les voyages sont visibles par tout utilisateur
-- authentifié, pas une liste privée.
create policy "trips_select_authenticated"
  on public.trips for select
  to authenticated
  using (true);

create policy "trips_insert_owner"
  on public.trips for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "trips_update_owner"
  on public.trips for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "trips_delete_owner"
  on public.trips for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================================
-- activities
-- ============================================================================

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  title text not null,
  type text not null check (type in ('food', 'sightseeing', 'nightlife', 'outdoor', 'other')),
  date_time timestamptz not null,
  location geography(Point, 4326) not null,
  location_label text not null,
  spots int not null check (spots > 0),
  -- Filtres de visibilité optionnels : NULL = pas de restriction sur ce critère.
  visibility_nationalities text[],
  visibility_languages text[],
  created_at timestamptz not null default now()
);

alter table public.activities enable row level security;

create index activities_location_gix on public.activities using gist (location);
create index activities_trip_id_idx on public.activities (trip_id);

-- Visible par un utilisateur authentifié si aucun filtre n'est renseigné, ou si
-- son profil correspond aux filtres nationalité/langue renseignés sur la ligne.
-- Le propriétaire du trip parent voit toujours sa propre activité, même si son
-- profil ne correspond pas au filtre qu'il a lui-même défini (sinon il ne
-- pourrait plus gérer sa propre sortie).
create policy "activities_select_visible"
  on public.activities for select
  to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = activities.trip_id
        and t.user_id = (select auth.uid())
    )
    or (
      (
        visibility_nationalities is null
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.nationality = any (activities.visibility_nationalities)
        )
      )
      and (
        visibility_languages is null
        or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid())
            and p.languages && activities.visibility_languages
        )
      )
    )
  );

create policy "activities_insert_trip_owner"
  on public.activities for insert
  to authenticated
  with check (
    exists (
      select 1 from public.trips t
      where t.id = activities.trip_id
        and t.user_id = (select auth.uid())
    )
  );

create policy "activities_update_trip_owner"
  on public.activities for update
  to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = activities.trip_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.trips t
      where t.id = activities.trip_id
        and t.user_id = (select auth.uid())
    )
  );

create policy "activities_delete_trip_owner"
  on public.activities for delete
  to authenticated
  using (
    exists (
      select 1 from public.trips t
      where t.id = activities.trip_id
        and t.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- participations
-- ============================================================================

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined')),
  created_at timestamptz not null default now(),
  unique (activity_id, user_id)
);

alter table public.participations enable row level security;

create index participations_activity_id_idx on public.participations (activity_id);
create index participations_user_id_idx on public.participations (user_id);

-- Visible par le participant lui-même, et par le propriétaire du trip/activité
-- concerné (pour gérer les demandes).
create policy "participations_select_self_or_owner"
  on public.participations for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.activities a
      join public.trips t on t.id = a.trip_id
      where a.id = participations.activity_id
        and t.user_id = (select auth.uid())
    )
  );

-- La vérification "places restantes" est faite par le trigger
-- enforce_activity_capacity (migration suivante), pas ici : un `with check`
-- basé sur une sous-requête ne verrouille pas les lignes concurrentes et est
-- donc sujet à une race condition si deux demandes arrivent en même temps.
-- Le trigger BEFORE INSERT verrouille la ligne activities (`for update`) pour
-- un comptage fiable.
create policy "participations_insert_self"
  on public.participations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Le propriétaire du trip/activité peut confirmer/refuser n'importe quelle
-- demande. L'utilisateur peut modifier sa propre ligne mais uniquement pour
-- l'annuler ou la réactiver (cf. participations_update_self ci-dessous), pas
-- pour se confirmer lui-même.
create policy "participations_update_owner"
  on public.participations for update
  to authenticated
  using (
    exists (
      select 1 from public.activities a
      join public.trips t on t.id = a.trip_id
      where a.id = participations.activity_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.activities a
      join public.trips t on t.id = a.trip_id
      where a.id = participations.activity_id
        and t.user_id = (select auth.uid())
    )
  );

-- L'utilisateur peut annuler sa propre demande ('declined') ou la réactiver
-- ('requested') après une annulation ; il ne peut jamais se confirmer
-- lui-même ('confirmed' reste réservé au propriétaire via
-- participations_update_owner). Choix produit assumé : sans ça, une
-- annulation serait définitive (contrainte unique (activity_id, user_id)).
create policy "participations_update_self"
  on public.participations for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and status in ('declined', 'requested'));

-- Pas de policy DELETE : l'annulation/réactivation passe par UPDATE
-- (cf. participations_update_self), pas de suppression dure au MVP.

-- ============================================================================
-- messages
-- ============================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  -- Nullable exprès : permet l'anonymisation RGPD (delete_own_account) sans
  -- supprimer le message ni casser l'historique des autres participants.
  user_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create index messages_activity_id_idx on public.messages (activity_id);

-- Lecture/écriture réservées aux participants confirmés de l'activité, plus le
-- propriétaire du trip/activité (chat de groupe par sortie, pas de 1-to-1 au MVP).
create policy "messages_select_confirmed_or_owner"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.participations p
      where p.activity_id = messages.activity_id
        and p.user_id = (select auth.uid())
        and p.status = 'confirmed'
    )
    or exists (
      select 1 from public.activities a
      join public.trips t on t.id = a.trip_id
      where a.id = messages.activity_id
        and t.user_id = (select auth.uid())
    )
  );

create policy "messages_insert_confirmed_or_owner"
  on public.messages for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      exists (
        select 1 from public.participations p
        where p.activity_id = messages.activity_id
          and p.user_id = (select auth.uid())
          and p.status = 'confirmed'
      )
      or exists (
        select 1 from public.activities a
        join public.trips t on t.id = a.trip_id
        where a.id = messages.activity_id
          and t.user_id = (select auth.uid())
      )
    )
  );

-- Pas de policy UPDATE/DELETE sur messages au MVP (pas d'édition/suppression de
-- message). L'anonymisation du user_id à la suppression de compte est faite par
-- la RPC SECURITY DEFINER delete_own_account(), qui contourne intentionnellement
-- ces restrictions.
