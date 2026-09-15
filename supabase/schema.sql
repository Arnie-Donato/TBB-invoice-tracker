create table if not exists public.invoices (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  vendor text not null,
  email text not null,
  invoice_no text,
  amount numeric(12,2) not null check (amount >= 0),
  invoice_date date,
  due_date date,
  status text not null check (status in ('New', 'For review', 'Approved', 'Paid')),
  notes text,
  attachment_name text,
  payment_id uuid,
  manual_paid boolean not null default false,
  paid_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  transaction_date date not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  invoice_id uuid references public.invoices(id),
  source text,
  wire_status text,
  review boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.invoices enable row level security;
alter table public.transactions enable row level security;

create policy "personal tracker invoices" on public.invoices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal tracker transactions" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
