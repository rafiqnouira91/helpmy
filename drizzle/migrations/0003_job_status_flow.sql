-- Toggle: return true to require SMS-verified phone again
create or replace function public.phone_required() returns boolean language sql immutable as $$ select false $$;

create or replace function public.can_transact() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (not public.phone_required() or public.phone_verified());
$$;

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (status in ('open','accepted','pending_approval','completed'));

drop policy if exists "Create own job" on public.jobs;
drop policy if exists "Helper accepts open job" on public.jobs;
drop policy if exists "Requester updates" on public.jobs;
drop policy if exists "Requester deletes" on public.jobs;

create policy "Create own open job" on public.jobs for insert to authenticated
  with check (auth.uid() = requester_id and status = 'open' and helper_id is null and public.can_transact());
create policy "Participants or open-job helpers update" on public.jobs for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = helper_id or (status = 'open' and auth.uid() <> requester_id))
  with check (auth.uid() = requester_id or auth.uid() = helper_id);
create policy "Owner deletes open job" on public.jobs for delete to authenticated
  using (auth.uid() = requester_id and status = 'open');

create or replace function public.enforce_job_update() returns trigger language plpgsql set search_path = public as $$
declare
  uid uuid := auth.uid();
  same_content boolean := new.category is not distinct from old.category and new.title is not distinct from old.title
    and new.detail is not distinct from old.detail and new.price is not distinct from old.price
    and new.location is not distinct from old.location and new.timing is not distinct from old.timing;
begin
  if uid is null then return new; end if; -- trusted server/admin only
  if new.id <> old.id or new.requester_id <> old.requester_id or new.created_at <> old.created_at then
    raise exception 'Fälten kan inte ändras';
  end if;
  if old.status = 'open' then
    if uid = old.requester_id then
      if new.status <> 'open' or new.helper_id is not null then raise exception 'Ägaren kan bara redigera öppna uppdrag'; end if;
      return new;
    end if;
    if new.status = 'accepted' and new.helper_id = uid and same_content and public.can_transact() then return new; end if;
    raise exception 'Ogiltig accept';
  elsif old.status = 'accepted' then
    if uid = old.helper_id and new.status = 'pending_approval' and new.helper_id = old.helper_id and same_content then return new; end if;
    raise exception 'Bara hjälparen kan markera klart';
  elsif old.status = 'pending_approval' then
    if uid = old.requester_id and new.status = 'completed' and new.helper_id = old.helper_id and same_content then return new; end if;
    raise exception 'Bara kunden kan godkänna';
  end if;
  raise exception 'Slutförda uppdrag kan inte ändras';
end $$;

drop trigger if exists jobs_enforce_update on public.jobs;
create trigger jobs_enforce_update before update on public.jobs for each row execute function public.enforce_job_update();