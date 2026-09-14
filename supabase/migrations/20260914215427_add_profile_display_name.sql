-- LifeSaver — ajout du nom d'affichage sur profiles
-- Nécessaire pour l'écran de matching/feed (ex. "Noa, Pays-Bas"), qui doit
-- pouvoir afficher le nom de l'organisateur d'une sortie. Ne modifie pas les
-- migrations déjà appliquées : ajoute la colonne et refait le trigger
-- handle_new_user() via `create or replace function`.

-- ============================================================================
-- profiles.display_name
-- ============================================================================

-- NOT NULL direct sans backfill : le projet est encore vide à ce stade (aucune
-- ligne dans profiles). Sur un environnement contenant déjà des profils, il
-- faudrait ajouter la colonne nullable, backfiller, puis contraindre NOT NULL
-- dans une étape séparée.
alter table public.profiles
  add column display_name text not null;

-- Même logique que les autres contraintes texte du schéma (ex. nationality
-- côté trigger) : pas de chaîne vide/blanche, longueur raisonnable pour un
-- prénom/pseudo affiché dans l'UI.
alter table public.profiles
  add constraint profiles_display_name_length
    check (char_length(trim(display_name)) between 1 and 60);

-- Pas de changement de policy RLS : display_name suit les mêmes règles de
-- lecture/écriture que le reste de la ligne profiles (select ouvert aux
-- authentifiés via profiles_select_authenticated, update restreint au
-- propriétaire via profiles_update_self, pas d'insert direct — voir
-- commentaires dans 20260914133437_initial_schema.sql).

-- ============================================================================
-- handle_new_user() — nouveau contrat d'inscription
-- ============================================================================

-- Contrat avec le frontend : auth.signUp() doit désormais être appelé avec
--   options.data = {
--     nationality: string,       -- requis
--     languages: string[],       -- requis (peut être vide, jamais absent)
--     privacy_accepted: true,    -- requis, doit être explicitement `true`
--     display_name: string       -- requis, non vide après trim, <= 60 caractères
--   }
-- Le trigger lit ces champs dans auth.users.raw_user_meta_data. S'ils sont
-- absents ou invalides, il lève une exception : comme ce trigger s'exécute
-- dans la même transaction que l'INSERT sur auth.users, l'inscription entière
-- échoue et est annulée (rollback). C'est le mécanisme qui garantit qu'aucun
-- profil ne peut exister sans consentement RGPD (privacy_accepted_at) ni nom
-- d'affichage valide.
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
  v_display_name text;
begin
  v_nationality := new.raw_user_meta_data ->> 'nationality';
  v_privacy_accepted := coalesce((new.raw_user_meta_data ->> 'privacy_accepted')::boolean, false);
  v_display_name := trim(new.raw_user_meta_data ->> 'display_name');

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

  if v_display_name is null or char_length(v_display_name) < 1 or char_length(v_display_name) > 60 then
    raise exception 'signup metadata missing or invalid "display_name" (raw_user_meta_data.display_name, 1 to 60 chars after trim)';
  end if;

  insert into public.profiles (id, nationality, languages, privacy_accepted_at, display_name)
  values (new.id, v_nationality, v_languages, now(), v_display_name);

  return new;
end;
$$;
