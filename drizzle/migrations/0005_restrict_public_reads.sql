drop policy if exists "Profiles are public" on public.profiles;
create policy "Signed-in users read profiles" on public.profiles for select to authenticated using (auth.uid() is not null);

drop policy if exists "Reviews are public" on public.reviews;
create policy "Signed-in users read reviews" on public.reviews for select to authenticated using (auth.uid() is not null);

drop policy if exists "Jobs are public" on public.jobs;
create policy "Open jobs are public" on public.jobs for select to anon, authenticated using (status = 'open');
create policy "Participants read their jobs" on public.jobs for select to authenticated using (auth.uid() = requester_id or auth.uid() = helper_id);