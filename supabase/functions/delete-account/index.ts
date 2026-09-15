// LifeSaver — Edge Function `delete-account`
//
// Complète la RPC `delete_own_account()` (voir
// supabase/migrations/20260914133438_auth_trigger_and_rgpd_functions.sql), qui
// anonymise/supprime les données applicatives d'un utilisateur mais NE PEUT PAS
// supprimer sa ligne `auth.users` (ça requiert l'API d'admin Supabase Auth avec
// la clé service_role, indisponible en SQL direct depuis une fonction
// SECURITY DEFINER classique). Cette fonction fait les deux étapes dans le bon
// ordre, dans une seule invocation HTTP :
//
//   1. Vérifie le JWT de l'appelant (header Authorization) auprès du serveur
//      Auth -> id utilisateur *vérifié*.
//   2. Appelle la RPC `delete_own_account()` avec un client scopé à cet
//      utilisateur (RLS respectée, auth.uid() résout correctement).
//   3. Seulement si (2) a réussi : supprime la ligne auth.users correspondante
//      via `auth.admin.deleteUser(<id vérifié à l'étape 1>)`, avec un client
//      service_role. L'id utilisé ici ne provient JAMAIS d'ailleurs que de
//      l'étape 1 (jamais du corps de la requête, d'un query param, etc.) —
//      c'est la garde de sécurité la plus importante de ce fichier, car la clé
//      service_role peut supprimer n'importe quel compte.
//
// Contrat de réponse (voir aussi le rapport de déploiement) :
//   - Succès : 200 { "success": true }
//   - Erreurs : { "error": "<message générique>" } avec le status HTTP
//     approprié (401 / 405 / 500). Aucun détail interne (message Postgres,
//     stack trace) n'est renvoyé au client ; les détails vont dans les logs
//     serveur via console.error.

import { createClient } from 'npm:@supabase/supabase-js@2'

// Boilerplate CORS standard Supabase (cf. docs.supabase.com/guides/functions/cors),
// adapté à un client mobile Expo : Authorization/apikey/content-type suffisent,
// pas de header custom exotique. Pas de wildcard sur les credentials puisqu'on
// n'utilise pas de cookies/credentials de navigateur ici (auth par Bearer token).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  // Préflight CORS : toujours répondre avant toute autre vérification.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Seul POST est accepté pour cette opération destructive.
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  // Étape 1 — client scopé à l'appelant (jamais la clé service_role ici), pour
  // que auth.getUser() vérifie le JWT auprès du serveur Auth plutôt que de se
  // contenter de le décoder localement.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const {
    data: { user },
    error: getUserError,
  } = await userClient.auth.getUser()

  if (getUserError || !user) {
    console.error('delete-account: auth.getUser() failed', getUserError)
    return jsonResponse({ error: 'Invalid or expired session' }, 401)
  }

  // A partir d'ici, `verifiedUserId` est la SEULE source de vérité pour
  // l'identité de l'appelant dans le reste de cette fonction. Aucune autre
  // valeur (corps de requête, query param, header custom) ne doit jamais être
  // utilisée à la place, en particulier à l'étape 3 ci-dessous.
  const verifiedUserId = user.id

  // Étape 2 — RPC applicative, avec le client scopé à l'utilisateur : RLS et
  // auth.uid() se comportent exactement comme si l'utilisateur appelait
  // lui-même la RPC depuis le client Supabase du frontend.
  const { error: rpcError } = await userClient.rpc('delete_own_account')

  if (rpcError) {
    console.error('delete-account: delete_own_account() RPC failed', rpcError)
    return jsonResponse({ error: 'Account deletion failed' }, 500)
  }

  // Étape 3 — uniquement si l'étape 2 a réussi. Client service_role distinct,
  // utilisé exclusivement pour cet appel d'admin. `verifiedUserId` (et rien
  // d'autre) est passé à deleteUser().
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(verifiedUserId)

  if (deleteUserError) {
    // Cas problématique : les données applicatives sont déjà supprimées mais
    // auth.users subsiste (compte "zombie" partiel). On logge en détail côté
    // serveur pour investigation/rattrapage manuel, sans exposer ces détails
    // au client.
    console.error(
      'delete-account: auth.admin.deleteUser() failed after delete_own_account() succeeded',
      deleteUserError,
      { userId: verifiedUserId },
    )
    return jsonResponse({ error: 'Account deletion failed' }, 500)
  }

  return jsonResponse({ success: true }, 200)
})
