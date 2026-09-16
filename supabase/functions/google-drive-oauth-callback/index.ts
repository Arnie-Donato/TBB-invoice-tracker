import { createClient } from 'npm:@supabase/supabase-js@2'

const appUrl = 'https://arnie-donato.github.io/TBB-invoice-tracker/'

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return Response.redirect(`${appUrl}?drive=failed&reason=missing`, 302)
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: pending, error: stateError } = await supabase.from('drive_oauth_states').select('*').eq('state', state).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (stateError || !pending) {
    console.error('Drive OAuth state lookup failed', { message: stateError?.message, hasPendingState: Boolean(pending) })
    return Response.redirect(`${appUrl}?drive=failed&reason=state`, 302)
  }
  const body = new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')!, redirect_uri: Deno.env.get('GOOGLE_DRIVE_REDIRECT_URI')!, grant_type: 'authorization_code' })
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const token = await tokenResponse.json()
  if (!tokenResponse.ok || !token.refresh_token) {
    console.error('Google token exchange failed', { status: tokenResponse.status, error: token.error, description: token.error_description, hasRefreshToken: Boolean(token.refresh_token) })
    return Response.redirect(`${appUrl}?drive=failed&reason=token`, 302)
  }
  const { error: connectionError } = await supabase.from('drive_connections').upsert({ user_id: pending.user_id, folder_id: Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')!, refresh_token: token.refresh_token })
  if (connectionError) {
    console.error('Drive connection save failed', { message: connectionError.message })
    return Response.redirect(`${appUrl}?drive=failed&reason=save`, 302)
  }
  await supabase.from('drive_oauth_states').delete().eq('state', state)
  return Response.redirect(`${appUrl}?drive=connected`, 302)
})
