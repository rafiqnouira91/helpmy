create table public.profiles (
  id uuid primary key,
  display_name text not null default 'Ny användare',
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select on public.profiles to anon, authenticated;
grant update, insert on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Profiles are public" on public.profiles for select using (true);
create policy "Own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Own profile update" on public.profiles for update to authenticated using (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  helper_id uuid,
  category text not null,
  title text not null,
  detail text not null default '',
  price integer not null,
  location text not null default 'Stockholm',
  timing text not null default 'Idag',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
grant select on public.jobs to anon, authenticated;
grant insert, update, delete on public.jobs to authenticated;
grant all on public.jobs to service_role;
alter table public.jobs enable row level security;
create policy "Jobs are public" on public.jobs for select using (true);
create policy "Create own job" on public.jobs for insert to authenticated with check (auth.uid() = requester_id);
create policy "Requester updates" on public.jobs for update to authenticated using (auth.uid() = requester_id);
create policy "Helper accepts open job" on public.jobs for update to authenticated
  using (status = 'open' and auth.uid() <> requester_id)
  with check (helper_id = auth.uid() and status = 'accepted');
create policy "Requester deletes" on public.jobs for delete to authenticated using (auth.uid() = requester_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reviewer_id uuid not null,
  reviewee_id uuid not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  unique (job_id, reviewer_id)
);
grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
grant all on public.reviews to service_role;
alter table public.reviews enable row level security;
create policy "Reviews are public" on public.reviews for select using (true);
create policy "Write own review" on public.reviews for insert to authenticated with check (
  auth.uid() = reviewer_id and exists (
    select 1 from public.jobs j where j.id = job_id and j.status = 'completed'
      and ((j.requester_id = auth.uid() and j.helper_id = reviewee_id) or (j.helper_id = auth.uid() and j.requester_id = reviewee_id))
  )
);