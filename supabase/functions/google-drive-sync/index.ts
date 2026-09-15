import { createClient } from 'npm:@supabase/supabase-js@2'

async function accessToken(refresh_token: string) {
  const body = new URLSearchParams({ client_id: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')!, refresh_token, grant_type: 'refresh_token' })
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!response.ok) throw new Error('Google token refresh failed')
  return (await response.json()).access_token
}

Deno.serve(async (request) => {
  if (request.headers.get('x-drive-sync-secret') !== Deno.env.get('DRIVE_SYNC_CRON_SECRET')) return new Response('Unauthorized', { status: 401 })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: connections } = await supabase.from('drive_connections').select('*')
  let imported = 0
  for (const connection of connections || []) {
    const token = await accessToken(connection.refresh_token)
    const query = new URLSearchParams({ q: `'${connection.folder_id}' in parents and trashed = false`, orderBy: 'createdTime desc', fields: 'files(id,name,mimeType,webViewLink,createdTime)' })
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, { headers: { Authorization: `Bearer ${token}` } })
    const { files = [] } = await response.json()
    for (const file of files.filter((f: { mimeType: string }) => f.mimeType === 'application/pdf')) {
      const { data: existing } = await supabase.from('invoices').select('id').eq('drive_file_id', file.id).maybeSingle()
      if (existing) continue
      await supabase.from('invoices').insert({ id: crypto.randomUUID(), user_id: connection.user_id, vendor: file.name.replace(/\.pdf$/i, ''), email: 'pending@drive.local', amount: 0, status: 'New', attachment_name: file.name, drive_file_id: file.id, drive_file_url: file.webViewLink, source: 'google_drive', imported_at: file.createdTime })
      imported++
    }
    await supabase.from('drive_connections').update({ last_synced_at: new Date().toISOString() }).eq('user_id', connection.user_id)
  }
  return Response.json({ imported })
})
