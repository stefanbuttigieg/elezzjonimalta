create table public.telegram_feedback (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  message_id bigint not null,
  user_id bigint,
  username text,
  command text,
  rating smallint not null check (rating in (-1, 1)),
  question text,
  answer text,
  created_at timestamptz not null default now(),
  unique (chat_id, message_id, user_id)
);

create index idx_telegram_feedback_created_at on public.telegram_feedback (created_at desc);
create index idx_telegram_feedback_rating on public.telegram_feedback (rating);

alter table public.telegram_feedback enable row level security;

create policy "Telegram feedback readable by admins"
on public.telegram_feedback
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));
