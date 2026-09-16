import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': 'https://arnie-donato.github.io', 'Access-Control-Allow-Headers': 'authorization, content-type' }

async function accessToken(refreshToken: string) {
  const body = new URLSearchParams({ client_id: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')!, refresh_token: refreshToken, grant_type: 'refresh_token' })
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!response.ok) throw new Error('Google token refresh failed')
  return (await response.json()).access_token as string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const authorization = request.headers.get('Authorization')
  if (!authorization) return Response.json({ error: 'Open PayTrack first.' }, { status: 401, headers: cors })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: { user }, error: userError } = await supabase.auth.getUser(authorization.replace('Bearer ', ''))
  if (userError || !user) return Response.json({ error: 'Invalid PayTrack session.' }, { status: 401, headers: cors })
  const { data: connection, error: connectionError } = await supabase.from('drive_connections').select('*').eq('user_id', user.id).maybeSingle()
  if (connectionError) throw connectionError
  if (!connection) return Response.json({ connected: false, imported: 0 }, { headers: cors })
  const driveToken = await accessToken(connection.refresh_token)
  const query = new URLSearchParams({ q: `'${connection.folder_id}' in parents and trashed = false`, orderBy: 'createdTime desc', fields: 'files(id,name,mimeType,webViewLink,createdTime)' })
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, { headers: { Authorization: `Bearer ${driveToken}` } })
  if (!response.ok) throw new Error('Google Drive listing failed')
  const { files = [] } = await response.json()
  let imported = 0
  for (const file of files.filter((item: { mimeType: string }) => item.mimeType === 'application/pdf')) {
    const { data: existing } = await supabase.from('invoices').select('id').eq('drive_file_id', file.id).maybeSingle()
    if (existing) continue
    const { error } = await supabase.from('invoices').insert({ id: crypto.randomUUID(), user_id: user.id, vendor: file.name.replace(/\.pdf$/i, ''), email: 'pending@drive.local', amount: 0, status: 'New', attachment_name: file.name, drive_file_id: file.id, drive_file_url: file.webViewLink, source: 'google_drive', imported_at: file.createdTime })
    if (error) throw error
    imported++
  }
  await supabase.from('drive_connections').update({ last_synced_at: new Date().toISOString() }).eq('user_id', user.id)
  return Response.json({ connected: true, imported }, { headers: cors })
})
