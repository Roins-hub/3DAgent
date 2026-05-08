-- Forma Agent generation history persistence.
-- Run this once in Supabase Dashboard -> SQL Editor.

create table if not exists public.generation_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('3d', 'image', 'cadam')),
  prompt text not null,
  mode text,
  status text not null check (status in ('queued', 'running', 'postprocessing', 'completed', 'failed')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  quality text,
  style text,
  target_format text,
  aspect_ratio text,
  result_url text,
  thumbnail_url text,
  error text,
  metadata jsonb,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_user_kind_created_idx
  on public.generation_jobs (user_id, kind, created_at desc);

create index if not exists generation_jobs_admin_created_idx
  on public.generation_jobs (kind, status, created_at desc);

alter table public.generation_jobs
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'generation_jobs'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%kind%'
    and pg_get_constraintdef(con.oid) like '%3d%'
    and pg_get_constraintdef(con.oid) like '%image%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.generation_jobs drop constraint %I', constraint_name);
  end if;

  alter table public.generation_jobs
    add constraint generation_jobs_kind_check
    check (kind in ('3d', 'image', 'cadam'));
end $$;

create table if not exists public.admin_settings (
  key text primary key,
  value text,
  is_secret boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text,
  action text not null,
  target_type text not null,
  target_id text,
  summary text,
  created_at timestamptz not null default now()
);

alter table public.generation_jobs enable row level security;
alter table public.admin_settings enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists "Users can read their own generation jobs" on public.generation_jobs;
create policy "Users can read their own generation jobs"
  on public.generation_jobs
  for select
  to authenticated
  using (user_id = auth.uid() and deleted_at is null);

drop policy if exists "Users can insert their own generation jobs" on public.generation_jobs;
create policy "Users can insert their own generation jobs"
  on public.generation_jobs
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own generation jobs" on public.generation_jobs;
create policy "Users can update their own generation jobs"
  on public.generation_jobs
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Admin settings are service-role only" on public.admin_settings;
create policy "Admin settings are service-role only"
  on public.admin_settings
  for all
  using (false)
  with check (false);

drop policy if exists "Admin audit logs are service-role only" on public.admin_audit_logs;
create policy "Admin audit logs are service-role only"
  on public.admin_audit_logs
  for all
  using (false)
  with check (false);
