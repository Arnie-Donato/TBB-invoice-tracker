# Google Drive sync secrets

Add these only in Supabase Dashboard > Edge Functions > Secrets. Never put them in GitHub or the browser app.

- `GOOGLE_DRIVE_CLIENT_ID`: `710787809427-hmcn186ql8nvpgr21vjr7p2gpckdjef8.apps.googleusercontent.com`
- `GOOGLE_DRIVE_CLIENT_SECRET`: copy this from the Google Cloud OAuth client page when the Drive backend is ready to deploy.
- `GOOGLE_DRIVE_FOLDER_ID`: `1HePmoV96nSX7zIoToWRcuNGDo00IL3te`
- `GOOGLE_DRIVE_REDIRECT_URI`: `https://jmhtbpeqwjruqlgngvcl.supabase.co/functions/v1/google-drive-oauth-callback`
