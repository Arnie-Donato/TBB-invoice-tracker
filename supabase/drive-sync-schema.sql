-- Run after the base schema. These fields let each invoice retain its Drive source.
alter table public.invoices add column if not exists drive_file_id text unique;
alter table public.invoices add column if not exists drive_file_url text;
alter table public.invoices add column if not exists source text not null default 'manual';
alter table public.invoices add column if not exists imported_at timestamptz;

create table if not exists public.drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  folder_id text not null,
  refresh_token text not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);

create table if not exists public.drive_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.drive_connections enable row level security;
alter table public.drive_oauth_states enable row level security;

-- Browser users can see only connection status, never the refresh token.
create policy "owner sees drive connection status" on public.drive_connections
  for select using (auth.uid() = user_id);
