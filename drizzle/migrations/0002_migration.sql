create or replace function public.phone_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.phone_confirmed_at is not null);
$$;
revoke execute on function public.phone_verified() from anon;
grant execute on function public.phone_verified() to authenticated;

drop policy "Create own job" on public.jobs;
create policy "Create own job" on public.jobs for insert to authenticated
  with check (auth.uid() = requester_id and public.phone_verified());
drop policy "Helper accepts open job" on public.jobs;
create policy "Helper accepts open job" on public.jobs for update to authenticated
  using (status = 'open' and auth.uid() <> requester_id and public.phone_verified())
  with check (helper_id = auth.uid() and status = 'accepted');