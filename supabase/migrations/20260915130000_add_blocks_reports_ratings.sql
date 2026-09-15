-- LifeSaver — socle sécurité/confiance : blocages, signalements, notations.
-- Trois tables indépendantes + une fonction helper `is_blocked` réutilisée
-- pour durcir deux policies existantes (activities, messages).

-- ============================================================================
-- blocks
-- ============================================================================

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_no_self_block check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;

create index blocks_blocker_id_idx on public.blocks (blocker_id);
create index blocks_blocked_id_idx on public.blocks (blocked_id);

-- Un utilisateur ne voit/gère que ses propres blocages (jamais la liste de
-- qui l'a bloqué, lui — ça se traduit uniquement par une disparition de
-- contenu côté activities/messages, cf. is_blocked ci-dessous, pas par une
-- notification ou une liste consultable).
create policy "blocks_select_own"
  on public.blocks for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

create policy "blocks_insert_own"
  on public.blocks for insert
  to authenticated
  with check ((select auth.uid()) = blocker_id);

create policy "blocks_delete_own"
  on public.blocks for delete
  to authenticated
  using ((select auth.uid()) = blocker_id);

-- Pas de policy UPDATE : un blocage se crée ou se supprime, ne se modifie
-- pas (il n'y a qu'une paire (blocker_id, blocked_id), rien d'autre à
-- éditer sur la ligne).

-- Prédicat symétrique (a a bloqué b OU b a bloqué a) : le produit traite le
-- blocage comme réciproque en pratique (décision assumée pour rester simple
-- au MVP — voir activities_select_visible / messages_insert_confirmed_or_owner
-- ci-dessous). SECURITY DEFINER + search_path vide : la fonction doit
-- pouvoir lire `blocks` indépendamment de la policy `blocks_select_own` (qui
-- ne renvoie que les blocages où l'appelant est blocker_id), sans quoi un
-- utilisateur bloqué par quelqu'un d'autre ne verrait jamais cette relation
-- et le filtrage sur activities/messages serait silencieusement inopérant
-- dans un sens. Comme la fonction ne fait que lire `blocks` (jamais
-- `activities`/`messages`), il n'y a pas de risque de récursion RLS.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke execute on function public.is_blocked(uuid, uuid) from public, anon;
grant execute on function public.is_blocked(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Durcissement de policies existantes : blocage effectif sur la visibilité
-- ----------------------------------------------------------------------------

-- Remplace la policy de 20260914133437_initial_schema.sql : ajoute
-- l'exclusion des activités dont le trip appartient à quelqu'un en relation
-- de blocage (dans un sens ou l'autre) avec l'appelant. Le propriétaire du
-- trip continue de voir sa propre activité (il ne peut pas s'être bloqué
-- lui-même, cf. blocks_no_self_block), donc la branche "owner" n'a pas
-- besoin d'un traitement séparé.
drop policy "activities_select_visible" on public.activities;

create policy "activities_select_visible"
  on public.activities for select
  to authenticated
  using (
    (
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
    )
    and not exists (
      select 1 from public.trips t
      where t.id = activities.trip_id
        and public.is_blocked((select auth.uid()), t.user_id)
    )
  );

-- Remplace la policy de 20260914133437_initial_schema.sql : défense en
-- profondeur. En pratique déjà couvert en amont par
-- activities_select_visible (un message ne peut être posté que sur une
-- activité déjà visible), mais un blocage créé *après* qu'un utilisateur a
-- rejoint une activité ne doit pas laisser la conversation ouverte entre
-- l'auteur du message et le propriétaire du trip.
drop policy "messages_insert_confirmed_or_owner" on public.messages;

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
    and not exists (
      select 1 from public.activities a
      join public.trips t on t.id = a.trip_id
      where a.id = messages.activity_id
        and public.is_blocked(messages.user_id, t.user_id)
    )
  );

-- ============================================================================
-- reports
-- ============================================================================

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  -- Nullable + ON DELETE SET NULL : le signalement doit survivre à la
  -- suppression de l'activité (preuve/historique de modération), à
  -- l'inverse de participations/messages qui, eux, sont bien liés au cycle
  -- de vie de l'activité.
  activity_id uuid references public.activities (id) on delete set null,
  reason text not null
    check (reason in ('inappropriate_behavior', 'fake_profile', 'harassment', 'spam', 'other')),
  details text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  constraint reports_no_self_report check (reporter_id <> reported_user_id)
);

alter table public.reports enable row level security;

create index reports_reporter_id_idx on public.reports (reporter_id);
create index reports_reported_user_id_idx on public.reports (reported_user_id);
create index reports_activity_id_idx on public.reports (activity_id);

-- Pas de policy de modération/admin au MVP : la revue humaine se fait via
-- le dashboard Supabase avec le rôle postgres, qui contourne RLS. Un
-- reporter ne voit que ses propres signalements (pas de liste des
-- signalements reçus, pour ne pas transformer `reports` en un canal
-- d'information indirect pour la personne signalée).
create policy "reports_select_own"
  on public.reports for select
  to authenticated
  using ((select auth.uid()) = reporter_id);

create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check ((select auth.uid()) = reporter_id);

-- Pas de policy UPDATE/DELETE : un signalement est immuable côté
-- utilisateur (seul le champ `status`, modifié par la modération via le
-- dashboard/rôle postgres, doit pouvoir changer après coup).

-- ============================================================================
-- ratings
-- ============================================================================

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  rated_id uuid not null references public.profiles (id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  constraint ratings_no_self_rating check (rater_id <> rated_id),
  unique (activity_id, rater_id, rated_id)
);

alter table public.ratings enable row level security;

create index ratings_activity_id_idx on public.ratings (activity_id);
create index ratings_rater_id_idx on public.ratings (rater_id);
create index ratings_rated_id_idx on public.ratings (rated_id);

-- Une note ne peut être posée que si : l'activité est passée, et rater/rated
-- étaient tous deux "confirmés" sur cette activité. Le propriétaire du trip
-- n'a pas forcément de ligne `participations` (il n'a pas besoin de
-- "demander" à participer à sa propre sortie) : on le traite comme confirmé
-- par construction via la branche `trips.user_id`, sur le même modèle que
-- les policies activities_*_trip_owner.
create policy "ratings_insert_confirmed_past_activity"
  on public.ratings for insert
  to authenticated
  with check (
    (select auth.uid()) = rater_id
    and exists (
      select 1 from public.activities a
      where a.id = ratings.activity_id
        and a.date_time < now()
    )
    and (
      exists (
        select 1 from public.participations p
        where p.activity_id = ratings.activity_id
          and p.user_id = ratings.rater_id
          and p.status = 'confirmed'
      )
      or exists (
        select 1 from public.activities a
        join public.trips t on t.id = a.trip_id
        where a.id = ratings.activity_id
          and t.user_id = ratings.rater_id
      )
    )
    and (
      exists (
        select 1 from public.participations p
        where p.activity_id = ratings.activity_id
          and p.user_id = ratings.rated_id
          and p.status = 'confirmed'
      )
      or exists (
        select 1 from public.activities a
        join public.trips t on t.id = a.trip_id
        where a.id = ratings.activity_id
          and t.user_id = ratings.rated_id
      )
    )
  );

-- Choix assumé sur l'anonymat de `rater_id` : après évaluation, on garde une
-- policy simple (lecture ouverte à tout utilisateur authentifié, `rater_id`
-- inclus), sur le même modèle que `profiles_select_authenticated`, plutôt
-- que de restreindre la colonne. Deux options écartées :
--   - Colonne `rater_id` restreinte via GRANT/REVOKE au niveau colonne :
--     casse `select *` (utilisé par défaut par PostgREST/le client Supabase)
--     même pour le rater qui consulte ses propres notes envoyées, sauf à
--     faire lister explicitement les colonnes côté client à chaque appel —
--     fragile et jamais utilisé ailleurs dans ce schéma.
--   - Vue publique sans `rater_id` + policy stricte sur la table brute :
--     duplique la logique de policy pour un besoin (anonymat du noteur) pas
--     encore validé côté produit sur ce MVP mono-ville.
-- Le produit expose déjà l'identité des participants d'une activité (auteur
-- des messages, demandes de participation) aux autres membres de la même
-- sortie : rendre `rater_id` visible reste cohérent avec ce niveau de
-- confiance existant, plutôt qu'une exception ad hoc pour cette seule table.
-- À revisiter si un besoin explicite d'anonymat des notateurs émerge.
create policy "ratings_select_authenticated"
  on public.ratings for select
  to authenticated
  using (true);

-- Pas de policy UPDATE/DELETE : une note posée est définitive au MVP (pas
-- d'édition a posteriori, pour éviter les allers-retours de représailles
-- entre participants après coup).

-- ============================================================================
-- RPC — note moyenne d'un profil
-- ============================================================================

-- Même pattern que activity_participant_counts
-- (20260914230240_activity_participant_counts_rpc.sql) : la policy
-- ratings_select_authenticated permet déjà au client d'agréger côté
-- application, mais une RPC SECURITY DEFINER évite de rapatrier toutes les
-- lignes de notation (score + comment + rater_id) juste pour calculer une
-- moyenne affichée sur une carte de profil, et centralise l'arrondi.
create or replace function public.profile_average_ratings(p_profile_ids uuid[])
returns table(profile_id uuid, average_score numeric, ratings_count bigint)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  -- Même garde-fou anti-abus que activity_participant_counts : le MVP
  -- mono-ville n'affiche jamais plus de quelques dizaines de profils à la
  -- fois (feed, liste de participants).
  if coalesce(array_length(p_profile_ids, 1), 0) > 200 then
    raise exception 'profile_average_ratings: too many profile_ids (max 200, got %)',
      array_length(p_profile_ids, 1);
  end if;

  return query
    select r.rated_id as profile_id,
           round(avg(r.score)::numeric, 2) as average_score,
           count(*) as ratings_count
    from public.ratings r
    where r.rated_id = any (p_profile_ids)
    group by r.rated_id;
end;
$$;

revoke execute on function public.profile_average_ratings(uuid[]) from public, anon;
grant execute on function public.profile_average_ratings(uuid[]) to authenticated;
