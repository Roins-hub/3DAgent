-- Forma Agent generation history persistence.
-- Run this once in Supabase Dashboard -> SQL Editor.

create table if not exists public.generation_jobs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('3d', 'image')),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_user_kind_created_idx
  on public.generation_jobs (user_id, kind, created_at desc);

alter table public.generation_jobs enable row level security;

drop policy if exists "Users can read their own generation jobs" on public.generation_jobs;
create policy "Users can read their own generation jobs"
  on public.generation_jobs
  for select
  to authenticated
  using (user_id = auth.uid());

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
