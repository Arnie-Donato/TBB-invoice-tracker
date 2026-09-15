import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://arnie-donato.github.io', 'Access-Control-Allow-Headers': 'authorization, content-type' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const authorization = request.headers.get('Authorization')
  if (!authorization) return Response.json({ error: 'Sign in first.' }, { status: 401, headers: cors })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = authorization.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return Response.json({ error: 'Invalid session.' }, { status: 401, headers: cors })
  const state = crypto.randomUUID()
  await supabase.from('drive_oauth_states').insert({ state, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
  const query = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!,
    redirect_uri: Deno.env.get('GOOGLE_DRIVE_REDIRECT_URI')!,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    state,
  })
  return Response.json({ authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${query}` }, { headers: cors })
})
