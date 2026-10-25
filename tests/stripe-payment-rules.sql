-- Run as database owner in a disposable Supabase test database, after 0000–0006.
-- All fixtures and helper functions roll back. Any wrong expectation raises an error.
begin;
insert into auth.users(id,email) values
 ('aaaaaaaa-0000-0000-0000-00000000aa01','stripe-requester@example.invalid'),
 ('bbbbbbbb-0000-0000-0000-00000000bb02','stripe-helper@example.invalid');
insert into public.jobs(id,requester_id,category,title,price) values
 ('11111111-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-00000000aa01','Ärende','Stripe test',500);
create function pg_temp.expect_payment_rule(uid text, label text, statement text, expected boolean) returns void language plpgsql as $$
declare actual boolean; n integer;
begin
 perform set_config('request.jwt.claim.sub',uid,true);
 perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
 perform set_config('role','authenticated',true);
 begin execute statement; get diagnostics n = row_count; actual := n > 0;
 exception when others then actual := false; end;
 perform set_config('role','none',true);
 if actual <> expected then raise exception 'FAIL: % (expected %, got %)',label,expected,actual; end if;
 raise notice 'PASS: %',label;
end $$;
select pg_temp.expect_payment_rule('bbbbbbbb-0000-0000-0000-00000000bb02','No acceptance without Connect account', $$update jobs set status='accepted',helper_id='bbbbbbbb-0000-0000-0000-00000000bb02' where id='11111111-0000-0000-0000-00000000aa01'$$,false);
insert into stripe_accounts values ('bbbbbbbb-0000-0000-0000-00000000bb02','acct_sql_test');
select pg_temp.expect_payment_rule('bbbbbbbb-0000-0000-0000-00000000bb02','Accept after Connect registration', $$update jobs set status='accepted',helper_id='bbbbbbbb-0000-0000-0000-00000000bb02' where id='11111111-0000-0000-0000-00000000aa01'$$,true);
select pg_temp.expect_payment_rule('bbbbbbbb-0000-0000-0000-00000000bb02','Cannot finish unpaid job', $$update jobs set status='pending_approval' where id='11111111-0000-0000-0000-00000000aa01'$$,false);
select pg_temp.expect_payment_rule('aaaaaaaa-0000-0000-0000-00000000aa01','Cannot forge payment', $$insert into job_payments(job_id,requester_id,helper_id,account_id,amount,helper_amount) values ('11111111-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-00000000aa01','bbbbbbbb-0000-0000-0000-00000000bb02','acct_sql_test',50000,42500)$$,false);
insert into job_payments(job_id,requester_id,helper_id,account_id,amount,helper_amount,paid_at,blocked) values
 ('11111111-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-00000000aa01','bbbbbbbb-0000-0000-0000-00000000bb02','acct_sql_test',50000,42500,now(),true);
select pg_temp.expect_payment_rule('bbbbbbbb-0000-0000-0000-00000000bb02','Blocked payment cannot finish', $$update jobs set status='pending_approval' where id='11111111-0000-0000-0000-00000000aa01'$$,false);
update job_payments set blocked=false;
select pg_temp.expect_payment_rule('bbbbbbbb-0000-0000-0000-00000000bb02','Paid job can be marked ready', $$update jobs set status='pending_approval' where id='11111111-0000-0000-0000-00000000aa01'$$,true);
select pg_temp.expect_payment_rule('aaaaaaaa-0000-0000-0000-00000000aa01','Cannot bypass transfer', $$update jobs set status='completed' where id='11111111-0000-0000-0000-00000000aa01'$$,false);
select pg_temp.expect_payment_rule('aaaaaaaa-0000-0000-0000-00000000aa01','Private payments cannot be read', $$select * from job_payments$$,false);
select pg_temp.expect_payment_rule('bbbbbbbb-0000-0000-0000-00000000bb02','Private Connect identifiers cannot be read', $$select * from stripe_accounts$$,false);
select pg_temp.expect_payment_rule('aaaaaaaa-0000-0000-0000-00000000aa01','Client cannot call privileged transfer RPC', $$select * from prepare_job_transfer('11111111-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-00000000aa01')$$,false);
-- Privileged server prepares once; repeats retain the original start timestamp.
select * from prepare_job_transfer('11111111-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-00000000aa01');
do $$declare started timestamptz; begin
 select transfer_started_at into started from job_payments where job_id='11111111-0000-0000-0000-00000000aa01';
 perform prepare_job_transfer('11111111-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-00000000aa01');
 if started is distinct from (select transfer_started_at from job_payments where job_id='11111111-0000-0000-0000-00000000aa01') then raise exception 'Transfer start was reset'; end if;
end $$;
update job_payments set transfer_started_at=now()-interval '24 hours';
do $$begin
 begin
  perform prepare_job_transfer('11111111-0000-0000-0000-00000000aa01','aaaaaaaa-0000-0000-0000-00000000aa01');
  raise exception 'FAIL: expired transfer attempt allowed' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
end $$;
update job_payments set transfer_id='tr_sql_test';
select pg_temp.expect_payment_rule('bbbbbbbb-0000-0000-0000-00000000bb02','Helper cannot approve own work', $$update jobs set status='completed' where id='11111111-0000-0000-0000-00000000aa01'$$,false);
select pg_temp.expect_payment_rule('aaaaaaaa-0000-0000-0000-00000000aa01','Requester may finish after transfer', $$update jobs set status='completed' where id='11111111-0000-0000-0000-00000000aa01'$$,true);
rollback;
