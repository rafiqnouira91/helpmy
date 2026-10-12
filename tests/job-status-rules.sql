-- Kör som databasägare. Testar statusflödet öppen → accepterad → väntar på godkännande → slutförd.
create or replace function pg_temp.t(u text, name text, q text, expect_ok bool) returns void language plpgsql as $f$
declare n int; res bool; msg text := '';
begin
  perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, false);
  perform set_config('role','authenticated', false);
  begin execute q; get diagnostics n = row_count; res := n > 0;
  exception when others then res := false; msg := ' ('||sqlerrm||')'; end;
  perform set_config('role','none', false);
  perform set_config('test.out', coalesce(current_setting('test.out', true),'') || case when res = expect_ok then 'OK  ' else 'FEL ' end || name || msg || E'\n', false);
end $f$;
select set_config('test.out','',false);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A (kund) skapar uppdrag', $q$insert into jobs(id,requester_id,category,title,price) values ('11111111-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-000000000001','Ärende','Testuppdrag',200)$q$, true);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A skapar med status slutförd (ska nekas)', $q$insert into jobs(requester_id,category,title,price,status) values ('aaaaaaaa-0000-0000-0000-000000000001','x','x',1,'completed')$q$, false);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A skapar i B:s namn (ska nekas)', $q$insert into jobs(requester_id,category,title,price) values ('bbbbbbbb-0000-0000-0000-000000000002','x','x',1)$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B ser A:s öppna uppdrag', $q$select 1 from jobs where id='11111111-0000-0000-0000-0000000000f1'$q$, true);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A ändrar pris på öppet uppdrag', $q$update jobs set price=250 where id='11111111-0000-0000-0000-0000000000f1'$q$, true);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A accepterar eget uppdrag (ska nekas)', $q$update jobs set status='accepted',helper_id='aaaaaaaa-0000-0000-0000-000000000001' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B ändrar pris på A:s uppdrag (ska nekas)', $q$update jobs set price=1 where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B raderar A:s uppdrag (ska nekas)', $q$delete from jobs where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B accepterar och ändrar pris samtidigt (ska nekas)', $q$update jobs set status='accepted',helper_id='bbbbbbbb-0000-0000-0000-000000000002',price=999 where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B accepterar åt C (ska nekas)', $q$update jobs set status='accepted',helper_id='cccccccc-0000-0000-0000-000000000003' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B hoppar direkt till slutförd (ska nekas)', $q$update jobs set status='completed',helper_id='bbbbbbbb-0000-0000-0000-000000000002' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B (hjälpare) accepterar', $q$update jobs set status='accepted',helper_id='bbbbbbbb-0000-0000-0000-000000000002' where id='11111111-0000-0000-0000-0000000000f1' and status='open'$q$, true);
select pg_temp.t('cccccccc-0000-0000-0000-000000000003','C tar över accepterat uppdrag (ska nekas)', $q$update jobs set helper_id='cccccccc-0000-0000-0000-000000000003' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A ändrar pris efter accept (ska nekas)', $q$update jobs set price=50 where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A byter hjälpare efter accept (ska nekas)', $q$update jobs set helper_id='cccccccc-0000-0000-0000-000000000003' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A raderar accepterat uppdrag (ska nekas)', $q$delete from jobs where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A slutför innan hjälparen är klar (ska nekas)', $q$update jobs set status='completed' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B sätter slutförd själv (ska nekas)', $q$update jobs set status='completed' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B: Jag är klar -> väntar på godkännande', $q$update jobs set status='pending_approval' where id='11111111-0000-0000-0000-0000000000f1'$q$, true);
select pg_temp.t('bbbbbbbb-0000-0000-0000-000000000002','B godkänner själv (ska nekas)', $q$update jobs set status='completed' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('cccccccc-0000-0000-0000-000000000003','C godkänner (ska nekas)', $q$update jobs set status='completed' where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A: Godkänn och avsluta -> slutförd', $q$update jobs set status='completed' where id='11111111-0000-0000-0000-0000000000f1'$q$, true);
select pg_temp.t('aaaaaaaa-0000-0000-0000-000000000001','A öppnar slutfört uppdrag igen (ska nekas)', $q$update jobs set status='open',helper_id=null where id='11111111-0000-0000-0000-0000000000f1'$q$, false);
select current_setting('test.out') || 'Slutläge: ' || (select status||', pris '||price from jobs where id='11111111-0000-0000-0000-0000000000f1') as result;
delete from jobs where id='11111111-0000-0000-0000-0000000000f1';
