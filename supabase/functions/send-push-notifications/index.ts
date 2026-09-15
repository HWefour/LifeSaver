// LifeSaver — Edge Function `send-push-notifications`
//
// Envoie une notification push Expo pour 2 événements uniquement (scope MVP) :
//   - `new_message` : nouveau message dans le chat d'une activité, aux
//     participants confirmés + à l'organisateur (hors auteur).
//   - `participation_requested` : nouvelle demande de participation, à
//     l'organisateur de l'activité.
//
// Réplique exactement le schéma de confiance de `delete-account/index.ts` :
//   1. Un client Supabase scopé à l'appelant (clé anon + header Authorization
//      transmis tel quel) vérifie le JWT via `auth.getUser()` (jamais de
//      décodage local) -> `verifiedUserId`.
//   2. "RLS comme oracle" : pour vérifier que l'appelant a le droit de
//      déclencher la notification sur une ressource donnée, on refait un
//      `select` sur cette ressource avec CE MEME client scopé. Si la ligne
//      revient, la policy RLS existante a déjà validé la légitimité de
//      l'appelant — on ne duplique pas la logique d'autorisation.
//   3. Le client service_role n'intervient QUE pour calculer les
//      destinataires en interne (lire des lignes `participations`/tokens que
//      l'appelant ne pourrait pas voir via RLS) — jamais pour ré-évaluer ou
//      contourner l'identité vérifiée à l'étape 1. `verifiedUserId` reste la
//      seule source de vérité pour "qui est l'appelant" dans toute la
//      fonction, exactement comme `delete-account`.
//
// Contrat :
//   POST body : { event: 'new_message', message_id: string }
//            | { event: 'participation_requested', participation_id: string }
//   Succès : 200 { success: true } — best-effort, ne reflète que le
//     traitement de la demande (autorisation + tentative d'envoi), jamais
//     l'action métier initiale (déjà effectuée côté client avant cet appel).
//   Erreurs : { error: "<message générique>" }, détails en console.error côté
//     serveur uniquement (400 / 401 / 403 / 405 / 500).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

// Boilerplate CORS identique à delete-account.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const MESSAGE_PREVIEW_MAX_LENGTH = 80

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength).trimEnd()}…`
}

type ExpoPushMessage = {
  to: string
  title: string
  body: string
  data: Record<string, unknown>
}

// Un seul appel HTTP avec tous les tokens de tous les destinataires (scope
// MVP mono-ville, volumes réduits — pas de chunking à 100 messages/requête).
// Les échecs partiels (tokens invalides/expirés) sont logués mais ne font
// jamais échouer la fonction : cet envoi est best-effort, l'action métier qui
// a déclenché l'appel a déjà réussi avant que cette fonction soit invoquée.
async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      console.error('send-push-notifications: Expo push API returned an error status', {
        status: response.status,
        payload,
      })
      return
    }

    // Le corps de réponse Expo contient un statut par ticket ; on logue les
    // échecs individuels (token invalide/expiré...) sans propager d'erreur —
    // le nettoyage des tokens invalides est une amélioration future, hors
    // scope de cette tâche.
    const tickets = Array.isArray(payload?.data) ? payload.data : []
    const errors = tickets.filter((ticket: { status?: string }) => ticket?.status === 'error')
    if (errors.length > 0) {
      console.error('send-push-notifications: some Expo push tickets failed', errors)
    }
  } catch (err) {
    console.error('send-push-notifications: failed to call Expo push API', err)
  }
}

async function getTokensForUsers(
  serviceClient: SupabaseClient,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return []

  const { data, error } = await serviceClient
    .from('push_tokens')
    .select('expo_push_token')
    .in('user_id', userIds)

  if (error) {
    console.error('send-push-notifications: failed to look up push_tokens', error)
    return []
  }

  return (data ?? []).map((row) => row.expo_push_token as string)
}

async function handleNewMessage(
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
  verifiedUserId: string,
  messageId: string,
): Promise<Response> {
  // ---- Autorisation (RLS comme oracle) --------------------------------
  // Le client scopé à l'appelant ne peut lire que les messages autorisés par
  // `messages_select_confirmed_or_owner` (participant confirmé de l'activité,
  // ou organisateur). Aucune ligne -> l'appelant n'a aucun droit ici, rejet
  // générique.
  const { data: message, error: messageError } = await userClient
    .from('messages')
    .select('id, activity_id, user_id, body')
    .eq('id', messageId)
    .maybeSingle()

  if (messageError || !message) {
    console.error('send-push-notifications: message lookup failed or not visible', {
      messageError,
      messageId,
    })
    return jsonResponse({ error: 'Not authorized for this resource' }, 403)
  }

  // L'appelant doit être l'auteur du message, pas seulement quelqu'un qui
  // peut le lire (ex. un autre participant confirmé du même chat).
  if (message.user_id !== verifiedUserId) {
    console.error('send-push-notifications: caller is not the message author', {
      verifiedUserId,
      messageAuthor: message.user_id,
    })
    return jsonResponse({ error: 'Not authorized for this resource' }, 403)
  }

  // ---- Calcul des destinataires (service_role, usage interne uniquement) --
  // Un participant non organisateur ne peut pas voir les autres lignes
  // `participations` via RLS (`participations_select_self_or_owner`), et un
  // participant confirmé pourrait exceptionnellement ne pas repasser le
  // filtre de visibilité de `activities_select_visible` — on utilise donc
  // service_role pour tout le calcul interne des destinataires. Ça ne
  // ré-autorise jamais l'appelant : son identité et son droit d'écrire ce
  // message sont déjà établis ci-dessus.
  const { data: activity, error: activityError } = await serviceClient
    .from('activities')
    .select('trip_id, title')
    .eq('id', message.activity_id)
    .maybeSingle()

  if (activityError || !activity) {
    console.error('send-push-notifications: activity lookup failed for message', {
      activityError,
      activityId: message.activity_id,
    })
    return jsonResponse({ error: 'Internal error' }, 500)
  }

  const { data: trip } = await serviceClient
    .from('trips')
    .select('user_id')
    .eq('id', activity.trip_id)
    .maybeSingle()

  const { data: participations, error: participationsError } = await serviceClient
    .from('participations')
    .select('user_id')
    .eq('activity_id', message.activity_id)
    .eq('status', 'confirmed')

  if (participationsError) {
    console.error('send-push-notifications: participations lookup failed', participationsError)
    return jsonResponse({ error: 'Internal error' }, 500)
  }

  const recipientIds = new Set<string>()
  for (const p of participations ?? []) {
    if (p.user_id && p.user_id !== verifiedUserId) recipientIds.add(p.user_id as string)
  }
  // trip.user_id est nullable (trip détaché, cf. RGPD delete_own_account) :
  // rien à envoyer à l'organisateur dans ce cas, silencieusement.
  if (trip?.user_id && trip.user_id !== verifiedUserId) {
    recipientIds.add(trip.user_id as string)
  }

  if (recipientIds.size === 0) {
    return jsonResponse({ success: true }, 200)
  }

  const tokens = await getTokensForUsers(serviceClient, [...recipientIds])
  if (tokens.length === 0) {
    // Aucun destinataire n'a de token enregistré : pas une erreur.
    return jsonResponse({ success: true }, 200)
  }

  // ---- Contenu de la notification ---------------------------------------
  // `activities.title` est `not null` en base ; on réutilise la valeur déjà
  // récupérée via service_role ci-dessus (même ligne que `trip_id`) plutôt
  // que de refaire un aller-retour — ce champ n'est pas sensible, la
  // distinction service_role/client scopé ne concerne que l'autorisation.
  const activityTitle = activity.title as string

  const { data: authorProfile } = await userClient
    .from('profiles')
    .select('display_name')
    .eq('id', verifiedUserId)
    .maybeSingle()

  const authorName = authorProfile?.display_name ?? 'Un voyageur'
  const preview = truncate(message.body ?? '', MESSAGE_PREVIEW_MAX_LENGTH)

  const pushMessages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title: activityTitle,
    body: `${authorName} : ${preview}`,
    data: { activityId: message.activity_id },
  }))

  await sendExpoPush(pushMessages)

  return jsonResponse({ success: true }, 200)
}

async function handleParticipationRequested(
  userClient: SupabaseClient,
  serviceClient: SupabaseClient,
  verifiedUserId: string,
  participationId: string,
): Promise<Response> {
  // ---- Autorisation (RLS comme oracle) --------------------------------
  // Le client scopé à l'appelant ne peut lire que les participations
  // autorisées par `participations_select_self_or_owner` (sa propre demande,
  // ou celles des activités qu'il organise). On exige explicitement que ce
  // soit SA PROPRE demande (pas celle d'un autre, même si l'appelant est
  // organisateur et pourrait la lire).
  const { data: participation, error: participationError } = await userClient
    .from('participations')
    .select('id, activity_id, user_id, status')
    .eq('id', participationId)
    .maybeSingle()

  if (participationError || !participation) {
    console.error('send-push-notifications: participation lookup failed or not visible', {
      participationError,
      participationId,
    })
    return jsonResponse({ error: 'Not authorized for this resource' }, 403)
  }

  if (participation.user_id !== verifiedUserId || participation.status !== 'requested') {
    console.error('send-push-notifications: participation not owned by caller or wrong status', {
      verifiedUserId,
      participationUser: participation.user_id,
      status: participation.status,
    })
    return jsonResponse({ error: 'Not authorized for this resource' }, 403)
  }

  // ---- Calcul du destinataire (service_role, usage interne uniquement) ----
  // trips est lisible par tout authentifié (`trips_select_authenticated`),
  // mais activities est filtrée par visibilité (`activities_select_visible`)
  // et rien ne garantit que le demandeur repasse ce filtre lui-même. On passe
  // par service_role pour ce lookup afin de toujours retrouver l'organisateur
  // de façon fiable, sans jamais ré-évaluer l'identité/le droit de l'appelant
  // (déjà établis ci-dessus).
  const { data: activity, error: activityError } = await serviceClient
    .from('activities')
    .select('trip_id, title')
    .eq('id', participation.activity_id)
    .maybeSingle()

  if (activityError || !activity) {
    console.error('send-push-notifications: activity lookup failed for participation', {
      activityError,
      activityId: participation.activity_id,
    })
    return jsonResponse({ error: 'Internal error' }, 500)
  }

  const { data: trip } = await serviceClient
    .from('trips')
    .select('user_id')
    .eq('id', activity.trip_id)
    .maybeSingle()

  // Trip détaché (RGPD, cf. delete_own_account) : pas d'organisateur, on
  // n'envoie rien, silencieusement.
  if (!trip?.user_id) {
    return jsonResponse({ success: true }, 200)
  }

  const ownerId = trip.user_id as string
  const tokens = await getTokensForUsers(serviceClient, [ownerId])
  if (tokens.length === 0) {
    return jsonResponse({ success: true }, 200)
  }

  const { data: requesterProfile } = await userClient
    .from('profiles')
    .select('display_name')
    .eq('id', verifiedUserId)
    .maybeSingle()

  const requesterName = requesterProfile?.display_name ?? 'Un voyageur'
  const activityTitle = activity.title as string

  const pushMessages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title: activityTitle,
    body: `${requesterName} souhaite rejoindre votre sortie`,
    data: { activityId: participation.activity_id },
  }))

  await sendExpoPush(pushMessages)

  return jsonResponse({ success: true }, 200)
}

type RequestBody =
  | { event: 'new_message'; message_id: string }
  | { event: 'participation_requested'; participation_id: string }

Deno.serve(async (req: Request) => {
  // Préflight CORS : toujours répondre avant toute autre vérification.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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

  // Étape 1 — client scopé à l'appelant (jamais service_role ici), pour que
  // auth.getUser() vérifie le JWT auprès du serveur Auth plutôt que de se
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
    console.error('send-push-notifications: auth.getUser() failed', getUserError)
    return jsonResponse({ error: 'Invalid or expired session' }, 401)
  }

  // A partir d'ici, `verifiedUserId` est la SEULE source de vérité pour
  // l'identité de l'appelant dans le reste de cette fonction. Aucune autre
  // valeur (corps de requête, query param, header custom) ne doit jamais être
  // utilisée à sa place.
  const verifiedUserId = user.id

  let body: RequestBody
  try {
    body = await req.json()
  } catch (err) {
    console.error('send-push-notifications: invalid JSON body', err)
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  if (!body || typeof body !== 'object' || typeof (body as { event?: unknown }).event !== 'string') {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  // Client service_role distinct, utilisé exclusivement pour le calcul
  // interne des destinataires (participants/organisateur, tokens push) une
  // fois l'appelant authentifié et autorisé sur la ressource concernée.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  switch (body.event) {
    case 'new_message': {
      const messageId = (body as { message_id?: unknown }).message_id
      if (typeof messageId !== 'string' || messageId.length === 0) {
        return jsonResponse({ error: 'Invalid request body' }, 400)
      }
      return await handleNewMessage(userClient, serviceClient, verifiedUserId, messageId)
    }
    case 'participation_requested': {
      const participationId = (body as { participation_id?: unknown }).participation_id
      if (typeof participationId !== 'string' || participationId.length === 0) {
        return jsonResponse({ error: 'Invalid request body' }, 400)
      }
      return await handleParticipationRequested(
        userClient,
        serviceClient,
        verifiedUserId,
        participationId,
      )
    }
    default:
      return jsonResponse({ error: 'Unknown event' }, 400)
  }
})
