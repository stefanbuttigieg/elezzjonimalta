-- Telegram bot polling state (singleton)
create table public.telegram_bot_state (
  id int primary key check (id = 1),
  update_offset bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.telegram_bot_state (id, update_offset) values (1, 0);

alter table public.telegram_bot_state enable row level security;

create policy "Bot state readable by admins"
on public.telegram_bot_state
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Telegram message log
create table public.telegram_messages (
  update_id bigint primary key,
  chat_id bigint not null,
  username text,
  text text,
  command text,
  response text,
  raw_update jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_telegram_messages_chat_id on public.telegram_messages (chat_id);
create index idx_telegram_messages_created_at on public.telegram_messages (created_at desc);

alter table public.telegram_messages enable row level security;

create policy "Telegram messages readable by admins"
on public.telegram_messages
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));
