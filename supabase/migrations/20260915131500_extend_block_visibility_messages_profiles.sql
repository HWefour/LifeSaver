-- LifeSaver — extension du filtrage par blocage à messages (select) et
-- profiles (select), en complément de 20260915130000_add_blocks_reports_ratings.sql
-- (qui couvrait déjà activities_select_visible et messages_insert_confirmed_or_owner).
-- Réutilise `is_blocked(a uuid, b uuid)` (créée dans la migration précédente)
-- pour rester cohérent plutôt que de dupliquer la logique blocker/blocked
-- inline dans chaque policy.

-- ============================================================================
-- messages_select_confirmed_or_owner
-- ============================================================================

-- Remplace la policy de 20260914133437_initial_schema.sql : un utilisateur
-- confirmé (ou propriétaire du trip) reste éligible à lire le chat, mais pas
-- les messages dont l'auteur est en relation de blocage avec lui (dans un
-- sens ou l'autre) — même s'il a par ailleurs accès à la conversation. Les
-- messages anonymisés (`user_id is null`, cf. delete_own_account) restent
-- visibles : `is_blocked(null, ...)` ne matche jamais de ligne dans `blocks`
-- et renvoie `false`, donc pas de blocage sur ces messages, ce qui est le
-- comportement voulu (il n'y a plus personne à bloquer côté message anonymisé).
drop policy "messages_select_confirmed_or_owner" on public.messages;

create policy "messages_select_confirmed_or_owner"
  on public.messages for select
  to authenticated
  using (
    (
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
    and not public.is_blocked(messages.user_id, (select auth.uid()))
  );

-- Pas de changement sur messages_insert_confirmed_or_owner : la relation de
-- blocage auteur <-> propriétaire du trip est déjà vérifiée à l'insertion
-- depuis 20260915130000_add_blocks_reports_ratings.sql. Le filtrage sur les
-- autres participants confirmés (potentiellement bloqués par l'auteur) se
-- fait côté lecture (cette policy), pas à l'écriture : bloquer l'insertion
-- pour "un participant confirmé quelconque pourrait avoir bloqué l'auteur"
-- empêcherait l'auteur de parler au reste du groupe à cause d'un blocage qui
-- ne concerne qu'une personne — chacun filtre simplement ce qu'il ne veut
-- plus voir à la lecture.

-- ============================================================================
-- profiles_select_authenticated
-- ============================================================================

-- Remplace la policy de 20260914133437_initial_schema.sql : un profil reste
-- masqué à quiconque est en relation de blocage avec son titulaire (dans un
-- sens ou l'autre), sauf son propre profil qui reste toujours visible à
-- soi-même (`(select auth.uid()) = id` court-circuite avant l'appel à
-- is_blocked, aucun utilisateur ne peut s'être bloqué lui-même de toute
-- façon — cf. blocks_no_self_block — mais on garde la clause explicite pour
-- la lisibilité de l'intention).
--
-- Risque de récursion RLS écarté : `profiles` est référencée par de
-- nombreuses policies (activities_select_visible, messages_*, etc.) via des
-- sous-requêtes `select ... from public.profiles`. `is_blocked()` est
-- SECURITY DEFINER + STABLE et ne lit que la table `blocks` (jamais
-- `profiles`), donc l'évaluation de cette policy ne redéclenche jamais
-- elle-même une évaluation de policy sur `profiles` — pas de boucle possible.
drop policy "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (
    (select auth.uid()) = id
    or not public.is_blocked((select auth.uid()), id)
  );
