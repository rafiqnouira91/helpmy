-- Disposable test database only, after migrations 0000–0007. No data retained.
begin;
select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
insert into public.jobs(id,requester_id,helper_id,category,title,price,status) values
('11111111-2222-4333-8444-555555555555','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','Test','Reservationstest',500,'accepted');
insert into public.job_payments(job_id,requester_id,helper_id,account_id,amount,helper_amount,authorized_at) values
('11111111-2222-4333-8444-555555555555','aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','acct_fixture',50000,42500,now());
update public.jobs set status='pending_approval' where id='11111111-2222-4333-8444-555555555555';
do $$ begin
 begin
  update public.jobs set status='completed' where id='11111111-2222-4333-8444-555555555555';
  raise exception 'FAIL: reservation completed without capture' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
 begin
  perform public.prepare_job_transfer('11111111-2222-4333-8444-555555555555','aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'FAIL: transfer prepared without capture' using errcode='P0002';
 exception when sqlstate 'P0001' then null; end;
end $$;
update public.job_payments set paid_at=now(), transfer_id='tr_fixture' where job_id='11111111-2222-4333-8444-555555555555';
update public.job_payments set paid_at=null where job_id='11111111-2222-4333-8444-555555555555';
do $$ begin
 if (select paid_at is null from public.job_payments where job_id='11111111-2222-4333-8444-555555555555') then
  raise exception 'FAIL: captured payment confirmation erased';
 end if;
end $$;
update public.jobs set status='completed' where id='11111111-2222-4333-8444-555555555555';
select 'PASS: reservation allows helper completion, capture required before transfer and final completion' as result;
rollback;
