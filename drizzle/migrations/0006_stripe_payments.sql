-- Apply once via Supabase SQL Editor. Never expose service-role keys.
begin;

create table public.stripe_accounts (
 user_id uuid primary key references auth.users(id),
 account_id text not null unique
);
create table public.job_payments (
 job_id uuid primary key references public.jobs(id),
 requester_id uuid not null,
 helper_id uuid not null,
 account_id text not null,
 amount integer not null check (amount > 0),
 helper_amount integer not null check (helper_amount > 0 and helper_amount < amount),
 checkout_started_at timestamptz not null default now(),
 checkout_id text unique,
 payment_intent_id text unique,
 charge_id text unique,
 paid_at timestamptz,
 transfer_started_at timestamptz,
 transfer_id text unique,
 blocked boolean not null default false
);
alter table public.stripe_accounts enable row level security;
alter table public.job_payments enable row level security;
revoke all on public.stripe_accounts, public.job_payments from anon, authenticated;
grant all on public.stripe_accounts, public.job_payments to service_role;

-- The API cannot bypass payment requirements by updating jobs directly.
create function public.enforce_job_payment() returns trigger language plpgsql security definer set search_path = public as $$
begin
 if new.status = 'accepted' and old.status = 'open' then
  if not exists (select 1 from public.stripe_accounts where user_id = new.helper_id) then
   raise exception 'Anslut ett Stripe-konto innan du accepterar';
  end if;
 elsif new.status = 'pending_approval' and old.status = 'accepted' then
  if not exists (select 1 from public.job_payments where job_id = new.id and paid_at is not null and not blocked) then
   raise exception 'Beställaren måste betala innan uppdraget kan markeras klart';
  end if;
 elsif new.status = 'completed' and old.status = 'pending_approval' then
  if not exists (select 1 from public.job_payments where job_id = new.id and transfer_id is not null and not blocked) then
   raise exception 'Godkänn via betalningstjänsten';
  end if;
 end if;
 return new;
end $$;
create trigger jobs_payment_guard before update on public.jobs for each row execute function public.enforce_job_payment();

-- Serialize the start of a transfer, preserve its original idempotency window.
create function public.prepare_job_transfer(p_job uuid, p_requester uuid)
returns setof public.job_payments language plpgsql security definer set search_path = public as $$
declare j public.jobs; p public.job_payments;
begin
 select * into j from public.jobs where id = p_job for update;
 if j.requester_id is distinct from p_requester or j.status not in ('pending_approval','completed') then
  raise exception 'Uppdraget kan inte godkännas';
 end if;
 select * into p from public.job_payments where job_id = p_job for update;
 if p.job_id is null or p.paid_at is null or p.blocked then raise exception 'Betalning saknas eller är spärrad'; end if;
 if p.transfer_id is null and p.transfer_started_at < now() - interval '23 hours' then
  raise exception 'Överföringen behöver stämmas av manuellt i Stripe innan nytt försök';
 end if;
 update public.job_payments set transfer_started_at = coalesce(transfer_started_at,now()) where job_id = p_job;
 return query select * from public.job_payments where job_id = p_job;
end $$;
revoke all on function public.prepare_job_transfer(uuid,uuid) from public, anon, authenticated;
grant execute on function public.prepare_job_transfer(uuid,uuid) to service_role;

commit;
