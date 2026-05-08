-- Create public bucket for candidate photos with staff write access
insert into storage.buckets (id, name, public)
values ('candidate-photos', 'candidate-photos', true)
on conflict (id) do update set public = excluded.public;

create policy "Candidate photos public read"
on storage.objects for select
using (bucket_id = 'candidate-photos');

create policy "Candidate photos staff insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'candidate-photos' and app_private.is_staff(auth.uid()));

create policy "Candidate photos staff update"
on storage.objects for update to authenticated
using (bucket_id = 'candidate-photos' and app_private.is_staff(auth.uid()));

create policy "Candidate photos staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'candidate-photos' and app_private.is_staff(auth.uid()));