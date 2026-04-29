create table public.api_request_logs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  method text not null,
  status_code integer not null,
  query_string text,
  ip_hash text,
  user_agent text,
  response_time_ms integer,
  created_at timestamptz not null default now()
);

create index api_request_logs_created_at_idx on public.api_request_logs (created_at desc);
create index api_request_logs_endpoint_idx on public.api_request_logs (endpoint);

alter table public.api_request_logs enable row level security;

create policy "ApiLogs staff read"
  on public.api_request_logs
  for select
  to authenticated
  using (app_private.is_staff(auth.uid()));

create policy "ApiLogs admin delete"
  on public.api_request_logs
  for delete
  to authenticated
  using (app_private.has_role(auth.uid(), 'admin'::app_role));