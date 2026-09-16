-- LifeSaver — trigger de création de profil, verrou de capacité des sorties,
-- et fonctions RGPD (droit à l'effacement + rétention).

-- ============================================================================
-- Création automatique du profil à l'inscription
-- ============================================================================

-- Contrat avec le frontend : auth.signUp() doit être appelé avec
--   options.data = {
--     nationality: string,       -- requis
--     languages: string[],       -- requis (peut être vide, jamais absent)
--     privacy_accepted: true     -- requis, doit être explicitement `true`
--   }
-- Le trigger lit ces champs dans auth.users.raw_user_meta_data. S'ils sont
-- absents ou invalides, il lève une exception : comme ce trigger s'exécute
-- dans la même transaction que l'INSERT sur auth.users, l'inscription entière
-- échoue et est annulée (rollback). C'est le mécanisme qui garantit qu'aucun
-- profil ne peut exister sans consentement RGPD (privacy_accepted_at).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nationality text;
  v_languages text[];
  v_privacy_accepted boolean;
begin
  v_nationality := new.raw_user_meta_data ->> 'nationality';
  v_privacy_accepted := coalesce((new.raw_user_meta_data ->> 'privacy_accepted')::boolean, false);

  if new.raw_user_meta_data ? 'languages' then
    select coalesce(array_agg(value), '{}')
      into v_languages
      from jsonb_array_elements_text(new.raw_user_meta_data -> 'languages') as value;
  else
    v_languages := '{}';
  end if;

  if v_nationality is null or v_nationality = '' then
    raise exception 'signup metadata missing "nationality" (raw_user_meta_data.nationality)';
  end if;

  if not v_privacy_accepted then
    raise exception 'signup metadata missing consent (raw_user_meta_data.privacy_accepted must be true)';
  end if;

  insert into public.profiles (id, nationality, languages, privacy_accepted_at)
  values (new.id, v_nationality, v_languages, now());

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- Capacité des activités (spots)
-- ============================================================================

-- Enforce "places restantes" à l'INSERT d'une participation. Compte toute
-- demande non refusée (requested + confirmed) contre `spots`, choix simple
-- pour le MVP plutôt qu'un système de liste d'attente. Verrouille la ligne
-- activities (`for update`) pour rester correct sous concurrence, ce qu'une
-- policy RLS seule (sous-requête dans WITH CHECK) ne garantit pas.
create or replace function public.enforce_activity_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spots int;
  v_taken int;
begin
  select spots into v_spots
    from public.activities
    where id = new.activity_id
    for update;

  if v_spots is null then
    raise exception 'activity % does not exist', new.activity_id;
  end if;

  select count(*) into v_taken
    from public.participations
    where activity_id = new.activity_id
      and status <> 'declined';

  if v_taken >= v_spots then
    raise exception 'activity % is full', new.activity_id;
  end if;

  return new;
end;
$$;

create trigger participations_enforce_capacity
  before insert on public.participations
  for each row execute procedure public.enforce_activity_capacity();

-- Même vérification que ci-dessus, mais pour l'UPDATE : sans ce trigger, une
-- ligne 'declined' (qui ne compte plus dans l'occupation) pourrait repasser à
-- 'requested' ou 'confirmed' (réactivation par l'utilisateur, ou confirmation
-- par l'organisateur) sans jamais repasser par le verrou d'INSERT, permettant
-- une sur-réservation. On ne déclenche la vérification que lorsque la
-- transition fait *entrer* la ligne dans un état occupant une place
-- (old.status = 'declined' et new.status <> 'declined') ; les autres
-- transitions (ex. 'requested' -> 'confirmed') n'ajoutent pas d'occupant et
-- restent déjà comptées. On exclut la ligne elle-même du comptage pour ne pas
-- se compter deux fois.
create or replace function public.enforce_activity_capacity_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spots int;
  v_taken int;
begin
  if old.status <> 'declined' or new.status = 'declined' then
    return new;
  end if;

  select spots into v_spots
    from public.activities
    where id = new.activity_id
    for update;

  if v_spots is null then
    raise exception 'activity % does not exist', new.activity_id;
  end if;

  select count(*) into v_taken
    from public.participations
    where activity_id = new.activity_id
      and status <> 'declined'
      and id <> new.id;

  if v_taken >= v_spots then
    raise exception 'activity % is full', new.activity_id;
  end if;

  return new;
end;
$$;

create trigger participations_enforce_capacity_on_update
  before update on public.participations
  for each row execute procedure public.enforce_activity_capacity_on_update();

-- ============================================================================
-- RGPD — droit à l'effacement
-- ============================================================================

-- Obligation légale (RGPD, droit à l'effacement), pas une feature produit.
-- Anonymise les messages de l'utilisateur (user_id -> NULL, le texte reste
-- pour ne pas casser l'historique de chat des autres participants), puis
-- supprime sa ligne profiles. Le ON DELETE CASCADE sur
-- participations.user_id retire ses propres participations. Ses trips sont
-- détachés (ON DELETE SET NULL sur trips.user_id), pas supprimés en cascade :
-- ça évite d'emporter avec eux les activities/messages qui appartiennent aux
-- autres participants de ces trips (voir commentaire sur trips.user_id dans
-- la migration de schéma).
-- Limite connue et volontaire : cette fonction ne supprime pas la ligne
-- auth.users elle-même (cela requiert l'API d'administration Supabase Auth
-- avec une clé service_role, pas un accès SQL direct) ; la suppression du
-- compte d'authentification doit être déclenchée séparément côté serveur
-- (edge function service_role appelant auth.admin.deleteUser) après l'appel
-- à cette RPC.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'delete_own_account() must be called by an authenticated user';
  end if;

  update public.messages
    set user_id = null
    where user_id = auth.uid();

  delete from public.profiles
    where id = auth.uid();
end;
$$;

-- Seuls les utilisateurs authentifiés peuvent appeler cette RPC (sur eux-mêmes,
-- via auth.uid() à l'intérieur de la fonction).
revoke execute on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- ============================================================================
-- RGPD — rétention des données
-- ============================================================================

-- Anonymise/supprime les voyages terminés depuis plus de 12 mois (et tout ce
-- qui en dépend par cascade : activities, participations ; les messages liés
-- à ces activités disparaissent avec elles). Destinée à être appelée par un
-- job planifié (pg_cron ou edge function planifiée) — le scheduler lui-même
-- n'est pas configuré ici, seule la fonction SQL est fournie.
-- SECURITY DEFINER + exécution restreinte au rôle postgres : cette fonction
-- n'est pas destinée à être appelée par les utilisateurs finaux via l'API,
-- uniquement par un job serveur.
create or replace function public.cleanup_expired_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.trips
    where end_date < (current_date - interval '12 months');
end;
$$;

revoke execute on function public.cleanup_expired_data() from public;
