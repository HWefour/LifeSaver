-- LifeSaver — ajoute une description libre aux activités ("Ça consiste en quoi ?")
-- Nullable : donnée non soumise à une exigence RGPD particulière, écran de
-- création de sortie (frontend) peut la laisser vide.
-- Pas de changement RLS nécessaire : les policies existantes sur
-- public.activities (activities_select_visible, activities_insert_trip_owner,
-- activities_update_trip_owner) s'appliquent à la ligne entière, pas colonne
-- par colonne — `description` suit donc automatiquement les mêmes règles que
-- title/type/date_time/etc.

alter table public.activities
  add column description text,
  add constraint activities_description_length
    check (description is null or char_length(description) <= 1000);
