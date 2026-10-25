-- Run once after 0006_stripe_payments.sql in your test database.
begin;
alter table public.job_payments add column authorized_at timestamptz;

-- Keep authorization/paid states from being erased by out-of-order events.
create function public.protect_payment_confirmation() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.paid_at is not null then new.paid_at := old.paid_at; end if;
  return new;
end $$;
create trigger job_payments_confirmation before update on public.job_payments
for each row execute function public.protect_payment_confirmation();

create or replace function public.enforce_job_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if new.status = 'accepted' and old.status = 'open' then
  if not exists (select 1 from public.stripe_accounts where user_id = new.helper_id) then
   raise exception 'Anslut ett Stripe-konto innan du accepterar';
  end if;
 elsif new.status = 'pending_approval' and old.status = 'accepted' then
  if not exists (select 1 from public.job_payments where job_id = new.id and (authorized_at is not null or paid_at is not null) and not blocked) then
   raise exception 'Beställaren måste först reservera betalningen';
  end if;
 elsif new.status = 'completed' and old.status = 'pending_approval' then
  if not exists (select 1 from public.job_payments where job_id = new.id and paid_at is not null and transfer_id is not null and not blocked) then
   raise exception 'Godkänn via betalningstjänsten';
  end if;
 end if;
 return new;
end $$;
commit;
