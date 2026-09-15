-- LifeSaver — table push_tokens : jetons Expo Push par utilisateur/appareil.
-- Alimente la edge function `send-push-notifications` (lookup interne via
-- service_role). RLS activée dès la création, comme pour toutes les tables du
-- schéma. Pas de couverture "un seul token par user" : un même utilisateur
-- peut avoir plusieurs appareils (ios + android, ou plusieurs installs).

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

-- Lookup interne par la edge function via service_role (pas de souci RLS à ce
-- niveau, service_role bypass RLS), mais l'index reste utile pour ce lookup.
create index push_tokens_user_id_idx on public.push_tokens (user_id);

-- Un utilisateur ne voit/gère que ses propres tokens.
create policy "push_tokens_select_self"
  on public.push_tokens for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "push_tokens_insert_self"
  on public.push_tokens for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Pas de policy UPDATE : le token est unique par ligne et le client gère le
-- ré-enregistrement via upsert sur la contrainte unique (expo_push_token) —
-- soit avec `ignoreDuplicates: true` (no-op si le token existe déjà), soit en
-- supprimant l'ancienne ligne avant d'en réinsérer une nouvelle (delete+insert,
-- les deux couverts par les policies ci-dessous/ci-dessus). Un upsert classique
-- `ON CONFLICT DO UPDATE` échouerait ici faute de policy UPDATE : c'est
-- volontaire, un token ne doit jamais changer de propriétaire par simple
-- écrasement de ligne.

create policy "push_tokens_delete_self"
  on public.push_tokens for delete
  to authenticated
  using ((select auth.uid()) = user_id);
