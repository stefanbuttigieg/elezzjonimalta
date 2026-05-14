create table public.page_seo (
  id uuid primary key default gen_random_uuid(),
  path text not null,
  lang text not null check (lang in ('en','mt')),
  title text,
  description text,
  og_image text,
  keywords text[] not null default '{}',
  noindex boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (path, lang)
);

alter table public.page_seo enable row level security;

create policy "page_seo readable by all"
  on public.page_seo for select
  using (true);

create policy "page_seo insert staff"
  on public.page_seo for insert
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'editor'));

create policy "page_seo update staff"
  on public.page_seo for update
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'editor'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'editor'));

create policy "page_seo delete staff"
  on public.page_seo for delete
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'editor'));

create trigger update_page_seo_updated_at
  before update on public.page_seo
  for each row execute function public.update_updated_at_column();

create index idx_page_seo_path_lang on public.page_seo(path, lang);