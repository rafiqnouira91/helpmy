insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-0000000000a1', 'Ahmed') on conflict do nothing;
insert into public.jobs (requester_id, category, title, detail, price, location, timing, created_at) values
('00000000-0000-0000-0000-0000000000a1','Akut','Behöver bensin','10 liter bensin till E4 vid Sollentuna',500,'E4, Sollentuna','Nu', now() - interval '4 minutes'),
('00000000-0000-0000-0000-0000000000a1','Ärende','Handla på Coop','Mjölk, ägg, kaffe och blöjor',200,'Coop Odenplan','Idag', now() - interval '20 minutes'),
('00000000-0000-0000-0000-0000000000a1','Hämtning','Hämta mitt paket','PostNord, Sollentuna',150,'Sollentuna centrum','Senast 18:00', now() - interval '1 hour'),
('00000000-0000-0000-0000-0000000000a1','Transport','Flytta två kartonger','Vasastan till Solna',350,'Vasastan','Imorgon', now() - interval '2 hours');
create policy "Avatar public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "Avatar own upload" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Avatar own update" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);