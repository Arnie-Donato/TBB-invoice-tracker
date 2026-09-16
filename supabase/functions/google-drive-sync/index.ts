import { createClient } from 'npm:@supabase/supabase-js@2'
import { getDocument } from 'npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs'

const cors = { 'Access-Control-Allow-Origin': 'https://arnie-donato.github.io', 'Access-Control-Allow-Headers': 'authorization, content-type' }

async function accessToken(refreshToken: string) {
  const body = new URLSearchParams({ client_id: Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')!, refresh_token: refreshToken, grant_type: 'refresh_token' })
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!response.ok) throw new Error('Google token refresh failed')
  return (await response.json()).access_token as string
}

function textFromFilename(name: string) { return name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() }
function toIsoDate(value?: string) { if (!value) return null; const parsed = new Date(value.replace(/(\d{1,2})(st|nd|rd|th)/gi, '$1')); return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10) }
function invoiceFields(text: string, filename: string) {
  const compact = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ')
  const invoiceNo = compact.match(/(?:invoice\s*(?:number|no\.?|#)?|inv\.?\s*(?:number|no\.?|#))\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{2,})/i)?.[1] || null
  const labelledAmounts = [...compact.matchAll(/(?:amount\s*due|balance\s*due|invoice\s*total|total\s*(?:amount)?|amount\s*payable)\s*[:$-]?\s*(?:USD|PHP|\$|₱)?\s*([\d,]+\.\d{2})/gi)]
  const currencyAmounts = [...compact.matchAll(/(?:USD|PHP|\$|₱)\s*([\d,]+\.\d{2})/gi)]
  const amounts = labelledAmounts.length ? labelledAmounts : currencyAmounts
  const amount = amounts.length ? Number(amounts[amounts.length - 1][1].replace(/,/g, '')) : 0
  const dueRaw = compact.match(/(?:due\s*date|payment\s*due|due)\s*[:#-]?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i)?.[1]
  const email = compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || 'pending@drive.local'
  return { vendor: textFromFilename(filename), email, invoice_no: invoiceNo, amount: Number.isFinite(amount) ? amount : 0, due_date: toIsoDate(dueRaw) }
}
async function readPdfFields(fileId: string, filename: string, token: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('Could not download PDF')
  const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), useWorkerFetch: false, isEvalSupported: false }).promise
  let text = ''
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) { const content = await (await pdf.getPage(pageNo)).getTextContent(); text += content.items.map((item: any) => item.str || '').join(' ') + '\n' }
  return invoiceFields(text, filename)
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
  let imported = 0, enriched = 0
  for (const file of files.filter((item: { mimeType: string }) => item.mimeType === 'application/pdf')) {
    const { data: existing } = await supabase.from('invoices').select('id,amount,invoice_no').eq('drive_file_id', file.id).maybeSingle()
    let fields = invoiceFields('', file.name)
    try { fields = await readPdfFields(file.id, file.name, driveToken) } catch (error) { console.warn('PDF text could not be read', { file: file.name, message: String(error) }) }
    if (existing) { if (!existing.amount || !existing.invoice_no) { const { error } = await supabase.from('invoices').update(fields).eq('id', existing.id); if (error) throw error; if (fields.amount || fields.invoice_no) enriched++ }; continue }
    const { error } = await supabase.from('invoices').insert({ id: crypto.randomUUID(), user_id: user.id, ...fields, status: 'New', attachment_name: file.name, drive_file_id: file.id, drive_file_url: file.webViewLink, source: 'google_drive', imported_at: file.createdTime })
    if (error) throw error
    imported++
  }
  await supabase.from('drive_connections').update({ last_synced_at: new Date().toISOString() }).eq('user_id', user.id)
  return Response.json({ connected: true, imported, enriched }, { headers: cors })
})
