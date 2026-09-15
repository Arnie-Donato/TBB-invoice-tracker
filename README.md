# PayTrack

A private invoice-and-payment tracker. It records invoices, imports a Chase CSV into a permanent local ledger, suggests matches, and requires a human confirmation before an invoice is marked paid.

## Run locally

```powershell
npm start
```

Open `http://localhost:4173`. No dependency download is required.

## Current MVP scope

- Invoice entry, search, statuses, and manual payment confirmation
- Chase CSV import with duplicate transaction protection
- Suggested exact-amount / date-window matches and explicit review
- Local browser storage (data stays on the device)

## Next integration required

The configured Invoice Inbox is Google Drive folder `1HePmoV96nSX7zIoToWRcuNGDo00IL3te`. Google Drive sync still needs a Google Workspace OAuth client because a sharing link alone does not grant the app permission to list or download files. Before production use, move data storage from browser local storage to Supabase and add user authentication.
