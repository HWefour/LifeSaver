-- LifeSaver — RPC de comptage agrégé des participations par activité
--
-- Contexte : l'écran Découvrir (useDiscoverFeed) a besoin du nombre de places
-- prises par activité pour calculer les places restantes, mais la policy RLS
-- `participations_select_self_or_owner` (20260914133437_initial_schema.sql)
-- ne rend visibles à un utilisateur que ses propres participations, ou celles
-- des activités dont il possède le trip — jamais les participations des
-- autres utilisateurs sur une activité qu'il ne possède pas. Un `select`
-- direct sur `participations` depuis le feed renvoie donc silencieusement 0
-- ligne pour la quasi-totalité des cartes affichées, et `spotsTaken` retombe
-- à 0 (activité complète affichée comme entièrement libre).
--
-- On ne touche pas à `participations_select_self_or_owner` (la policy est
-- correcte pour son usage : gérer ses propres demandes / celles reçues sur
-- ses activités). On expose à la place une RPC SECURITY DEFINER qui ne
-- renvoie que des comptes agrégés par activity_id, jamais les user_id
-- individuels ni le statut détaillé par utilisateur : ça ne réintroduit pas
-- la fuite que la policy RLS empêche (qui a rejoint / demandé quoi), la seule
-- information exposée est "combien de places sont prises", nécessaire au
-- produit pour tout visiteur du feed.
--
-- Pas de vérification supplémentaire de visibilité de l'activité
-- (visibility_nationalities/visibility_languages) ici : les activity_id sont
-- des uuid non énumérables, et le frontend n'appelle cette RPC qu'avec les
-- id déjà renvoyés par sa requête sur `activities` (qui, elle, respecte
-- `activities_select_visible`). Ajouter un filtre équivalent ici dupliquerait
-- cette policy sans bénéfice réel pour le MVP mono-ville — à revisiter si le
-- produit évolue vers un scénario où l'énumération d'activity_id devient un
-- vecteur d'attaque plausible.
create or replace function public.activity_participant_counts(p_activity_ids uuid[])
returns table(activity_id uuid, taken_count bigint)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  -- Garde-fou anti-abus : le feed MVP (une seule ville pilote) ne charge
  -- jamais plus de quelques dizaines de cartes à la fois. Une limite large
  -- mais finie évite qu'un appel RPC direct (hors UI) ne serve à scanner un
  -- grand nombre d'activity_id en un seul aller-retour.
  if coalesce(array_length(p_activity_ids, 1), 0) > 200 then
    raise exception 'activity_participant_counts: too many activity_ids (max 200, got %)',
      array_length(p_activity_ids, 1);
  end if;

  return query
    select p.activity_id, count(*) as taken_count
    from public.participations p
    where p.activity_id = any (p_activity_ids)
      and p.status <> 'declined'
    group by p.activity_id;
end;
$$;

-- Même schéma d'accès que les autres RPC destinées au client (cf.
-- delete_own_account dans 20260914133438_auth_trigger_and_rgpd_functions.sql
-- / 20260914140107_security_advisor_fixes.sql) : Supabase accorde EXECUTE aux
-- rôles anon/authenticated/service_role à la création, indépendamment du
-- pseudo-rôle PUBLIC — il faut donc explicitement revoke anon et public, et
-- ne garder que authenticated (le feed n'est pas accessible aux visiteurs
-- non connectés, cf. policies `for select to authenticated` sur activities).
revoke execute on function public.activity_participant_counts(uuid[]) from public, anon;
grant execute on function public.activity_participant_counts(uuid[]) to authenticated;
