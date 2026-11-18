-- =====================================================================
-- Queue Management System — Supabase (cloud) backend
--
-- Every queue rule lives in this file as a Postgres function, so all
-- devices (guard phone, counters, TV display) share one source of truth.
-- Apps call these functions with supabase.rpc(...). Tables are never
-- written to directly from an app: Row Level Security blocks it.
--
-- Realtime: every change inserts one row into queue_events. Apps listen
-- for those inserts and re-read queue_snapshot(). CALLED / RECALLED
-- events carry the ticket and counter, which the TV display announces.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.counters (
  id                int primary key,
  name              text not null,
  queue_type        text not null check (queue_type in ('REGULAR', 'PRIORITY', 'COMPLAINT')),
  status            text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAUSED', 'OFFLINE')),
  current_ticket_id bigint
);

create table public.tickets (
  id             bigint generated always as identity primary key,
  queue_number   text not null,
  queue_type     text not null check (queue_type in ('REGULAR', 'PRIORITY', 'COMPLAINT')),
  session_date   date not null,
  number_seq     int not null,
  status         text not null check (status in ('WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED')),
  created_at     timestamptz not null default now(),
  called_at      timestamptz,
  serving_at     timestamptz,
  completed_at   timestamptz,
  counter_id     int references public.counters (id),
  called_by_user text,
  notes          text
);

create index tickets_queue_idx on public.tickets (session_date, status, queue_type, number_seq);

alter table public.counters
  add constraint counters_current_ticket_fk
  foreign key (current_ticket_id) references public.tickets (id) on delete set null;

create table public.settings (
  key   text primary key,
  value text not null
);

-- Daily numbering per queue type (R-001, P-001, C-001 ...)
create table public.queue_sequences (
  queue_type   text primary key check (queue_type in ('REGULAR', 'PRIORITY', 'COMPLAINT')),
  current_seq  int not null default 0,
  session_date date not null
);

-- Staff accounts. One row per Supabase Auth user that may operate a station.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text not null unique,
  full_name  text not null,
  role       text not null check (role in ('ADMIN', 'GUARD', 'COUNTER')),
  counter_id int references public.counters (id)
);

-- Change feed that every screen listens to over Supabase Realtime
create table public.queue_events (
  id         bigint generated always as identity primary key,
  action     text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------

insert into public.counters (id, name, queue_type, status) values
  (1, 'Counter 1', 'REGULAR', 'ACTIVE'),
  (2, 'Counter 2', 'PRIORITY', 'ACTIVE'),
  (3, 'Counter 3', 'COMPLAINT', 'ACTIVE');

insert into public.settings (key, value) values
  ('office_name', 'PANELCO III SOUTHEAST AREA OFFICE'),
  ('office_tagline', 'Queue Management System'),
  ('regular_prefix', 'R'),
  ('priority_prefix', 'P'),
  ('complaint_prefix', 'C'),
  ('sound_enabled', 'true'),
  ('tts_voice_pitch', '1.0'),
  ('tts_voice_rate', '0.9'),
  -- Decides when "today" starts and ends for numbering and reports
  ('timezone', 'Asia/Manila');

insert into public.queue_sequences (queue_type, current_seq, session_date)
select q, 0, (now() at time zone 'Asia/Manila')::date
from unnest(array['REGULAR', 'PRIORITY', 'COMPLAINT']) as q;

-- ---------------------------------------------------------------------
-- Row Level Security: apps may only read what the screens need.
-- All writes go through the security-definer functions below.
-- ---------------------------------------------------------------------

alter table public.counters        enable row level security;
alter table public.tickets         enable row level security;
alter table public.settings        enable row level security;
alter table public.queue_sequences enable row level security;
alter table public.profiles        enable row level security;
alter table public.queue_events    enable row level security;

create policy "Anyone can read settings" on public.settings
  for select to anon, authenticated using (true);

-- The public TV display is not signed in, so it must see the change feed
create policy "Anyone can read queue events" on public.queue_events
  for select to anon, authenticated using (true);

create policy "Staff can read their own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

alter publication supabase_realtime add table public.queue_events;

-- ---------------------------------------------------------------------
-- Staff profile is created when an admin creates an Auth user whose
-- app_metadata carries staff_role. app_metadata can only be set with the
-- service-role key, so nobody can sign up and make themselves staff.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_staff_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.raw_app_meta_data ? 'staff_role' then
    insert into public.profiles (id, username, full_name, role, counter_id)
    values (
      new.id,
      coalesce(new.raw_app_meta_data ->> 'username', split_part(new.email, '@', 1)),
      coalesce(new.raw_app_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
      upper(new.raw_app_meta_data ->> 'staff_role'),
      nullif(new.raw_app_meta_data ->> 'counter_id', '')::int
    );
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_staff_user();

-- ---------------------------------------------------------------------
-- Internal helpers (not callable from apps)
-- ---------------------------------------------------------------------

create or replace function public._office_tz()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value from public.settings where key = 'timezone'), 'Asia/Manila');
$$;

create or replace function public._office_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone public._office_tz())::date;
$$;

-- Signed-in staff member with one of the allowed roles, or an error
create or replace function public._require_staff(allowed text[])
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then
    raise exception 'Please sign in with a staff account.' using errcode = '28000';
  end if;
  if not (p.role = any (allowed)) then
    raise exception 'Your account (%) is not allowed to do this.', lower(p.role) using errcode = '42501';
  end if;
  return p;
end;
$$;

-- Serialises every queue change, like SQLite's BEGIN IMMEDIATE did, so two
-- guard taps never get the same number and two counters never call the
-- same customer. Held until the calling function's transaction ends.
create or replace function public._lock_queue()
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtext('queue_app'));
$$;

create or replace function public._emit(p_action text, p_payload jsonb default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.queue_events (action, payload) values (p_action, p_payload);
$$;

-- Cancels tickets left open from previous days and frees counters holding
-- one, so yesterday's leftovers never linger if nobody pressed Reset.
create or replace function public._close_stale_tickets()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := public._office_today();
begin
  update public.counters
     set current_ticket_id = null
   where current_ticket_id in (select id from public.tickets where session_date < today);

  update public.tickets
     set status = 'CANCELLED',
         completed_at = now(),
         notes = coalesce(notes || ' ', '') || '[Auto-closed: previous day]'
   where session_date < today
     and status in ('WAITING', 'CALLED', 'SERVING', 'SKIPPED');
end;
$$;

-- The counter a staff member is acting on. A COUNTER account linked to a
-- counter may only operate that one.
create or replace function public._counter_for(p_counter_id int, p_user public.profiles)
returns public.counters
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.counters;
begin
  if p_user.role = 'COUNTER' and p_user.counter_id is not null and p_user.counter_id <> p_counter_id then
    raise exception 'This account operates Counter %, not Counter %.', p_user.counter_id, p_counter_id
      using errcode = '42501';
  end if;
  select * into c from public.counters where id = p_counter_id;
  if c.id is null then
    raise exception 'Counter % not found.', p_counter_id using errcode = 'P0002';
  end if;
  return c;
end;
$$;

-- Queue types a counter may call right now: its own, plus the queue of a
-- paused partner. Regular and Priority cover for each other; Complaint
-- (Counter 3) stays specialised.
create or replace function public._servable_queue_types(c public.counters)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  covered text[];
begin
  if c.queue_type not in ('REGULAR', 'PRIORITY') then
    return array[c.queue_type];
  end if;
  select coalesce(array_agg(distinct queue_type), '{}')
    into covered
    from public.counters
   where status = 'PAUSED'
     and id <> c.id
     and queue_type in ('REGULAR', 'PRIORITY')
     and queue_type <> c.queue_type;
  return array[c.queue_type] || covered;
end;
$$;

create or replace function public._require_active(c public.counters)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if c.status = 'PAUSED' then
    raise exception '% is paused. Resume the counter before calling a customer.', c.name;
  end if;
end;
$$;

-- Marks the customer currently at the counter as served
create or replace function public._finish_current(c public.counters)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tickets
     set status = 'COMPLETED', completed_at = now()
   where id = c.current_ticket_id
     and status in ('CALLED', 'SERVING');
$$;

-- Calls a ticket to a counter and announces it on the TV display
create or replace function public._assign_ticket(c public.counters, p_ticket_id bigint, p_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
  payload jsonb;
begin
  update public.tickets
     set status = 'CALLED',
         called_at = now(),
         serving_at = now(),
         counter_id = c.id,
         called_by_user = p_username
   where id = p_ticket_id
  returning * into t;

  update public.counters set current_ticket_id = t.id where id = c.id;

  payload := jsonb_build_object(
    'id', t.id,
    'queue_number', t.queue_number,
    'queue_type', t.queue_type,
    'counter_id', c.id,
    'counter_name', c.name,
    'called_at', t.called_at
  );
  perform public._emit('CALLED', payload);
  return payload;
end;
$$;

-- ---------------------------------------------------------------------
-- Public read: everything a screen needs in one call.
-- The unsigned-in TV display gets counters, counts and recently served;
-- signed-in staff also get the waiting and on-hold lists.
-- ---------------------------------------------------------------------

create or replace function public.queue_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := public._office_today();
  is_staff boolean := exists (select 1 from public.profiles where id = auth.uid());
begin
  return jsonb_build_object(
    'counters', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id,
               'name', c.name,
               'queue_type', c.queue_type,
               'status', c.status,
               'current_ticket', case when t.id is null then null else jsonb_build_object(
                 'id', t.id,
                 'queue_number', t.queue_number,
                 'queue_type', t.queue_type,
                 'status', t.status,
                 'called_at', t.called_at
               ) end
             ) order by c.id), '[]'::jsonb)
        from public.counters c
        left join public.tickets t on t.id = c.current_ticket_id
    ),
    'waiting_counts', (
      select jsonb_build_object(
               'REGULAR', count(*) filter (where queue_type = 'REGULAR'),
               'PRIORITY', count(*) filter (where queue_type = 'PRIORITY'),
               'COMPLAINT', count(*) filter (where queue_type = 'COMPLAINT'),
               'TOTAL', count(*)
             )
        from public.tickets
       where status = 'WAITING' and session_date = today
    ),
    'waiting_tickets', case when not is_staff then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', id,
               'queue_number', queue_number,
               'queue_type', queue_type,
               'number_seq', number_seq,
               'created_at', created_at,
               'notes', notes
             ) order by number_seq, id), '[]'::jsonb)
        from public.tickets
       where status = 'WAITING' and session_date = today
    ) end,
    'skipped_tickets', case when not is_staff then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id,
               'queue_number', t.queue_number,
               'queue_type', t.queue_type,
               'called_at', t.called_at,
               'counter_id', t.counter_id,
               'counter_name', c.name
             ) order by t.called_at desc), '[]'::jsonb)
        from public.tickets t
        left join public.counters c on c.id = t.counter_id
       where t.status = 'SKIPPED' and t.session_date = today
    ) end,
    'recently_served', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.completed_at desc), '[]'::jsonb)
        from (
          select t.id, t.queue_number, t.queue_type, t.completed_at, c.name as counter_name
            from public.tickets t
            left join public.counters c on c.id = t.counter_id
           where t.status = 'COMPLETED' and t.session_date = today
           order by t.completed_at desc
           limit 8
        ) r
    ),
    'settings', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.settings),
    'session_date', today,
    'server_time', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Guard station
-- ---------------------------------------------------------------------

create or replace function public.generate_ticket(p_queue_type text, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q text := upper(p_queue_type);
  today date;
  tz text;
  prefix text;
  seq int;
  t public.tickets;
begin
  perform public._require_staff(array['GUARD', 'ADMIN']);
  if q is null or q not in ('REGULAR', 'PRIORITY', 'COMPLAINT') then
    raise exception 'Invalid queue type: %', p_queue_type using errcode = '22023';
  end if;

  perform public._lock_queue();
  perform public._close_stale_tickets();

  today := public._office_today();
  tz := public._office_tz();

  select value into prefix from public.settings where key = lower(q) || '_prefix';
  prefix := coalesce(nullif(trim(prefix), ''), left(q, 1));

  -- Next number for today; starts again at 1 on a new day even without a reset
  insert into public.queue_sequences as s (queue_type, current_seq, session_date)
  values (q, 1, today)
  on conflict (queue_type) do update
     set current_seq = case when s.session_date = excluded.session_date then s.current_seq + 1 else 1 end,
         session_date = excluded.session_date
  returning s.current_seq into seq;

  insert into public.tickets (queue_number, queue_type, session_date, number_seq, status, notes)
  values (
    prefix || '-' || case when seq < 1000 then lpad(seq::text, 3, '0') else seq::text end,
    q, today, seq, 'WAITING', nullif(trim(p_notes), '')
  )
  returning * into t;

  perform public._emit('TICKET_CREATED');

  return jsonb_build_object(
    'id', t.id,
    'queue_number', t.queue_number,
    'queue_type', t.queue_type,
    'session_date', t.session_date,
    'number_seq', t.number_seq,
    'status', t.status,
    'created_at', t.created_at,
    'office_name', coalesce((select value from public.settings where key = 'office_name'), ''),
    'date_formatted', to_char(t.created_at at time zone tz, 'DD/MM/YYYY'),
    'time_formatted', to_char(t.created_at at time zone tz, 'HH12:MI AM')
  );
end;
$$;

-- Guard undo for a mis-tapped ticket nobody has called yet. If it was the
-- latest number issued for its queue today, the number is reused.
create or replace function public.void_ticket(p_ticket_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
  rolled_back boolean := false;
begin
  perform public._require_staff(array['GUARD', 'ADMIN']);
  perform public._lock_queue();

  select * into t from public.tickets where id = p_ticket_id;
  if t.id is null then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if t.status <> 'WAITING' then
    raise exception 'Ticket % can no longer be voided (already %).', t.queue_number, lower(t.status);
  end if;

  update public.tickets
     set status = 'CANCELLED',
         completed_at = now(),
         notes = coalesce(notes || ' ', '') || '[Voided by guard]'
   where id = t.id;

  if t.session_date = public._office_today() then
    update public.queue_sequences
       set current_seq = t.number_seq - 1
     where queue_type = t.queue_type
       and session_date = t.session_date
       and current_seq = t.number_seq;
    rolled_back := found;
  end if;

  perform public._emit('TICKET_VOIDED');
  return jsonb_build_object('queue_number', t.queue_number, 'sequence_rolled_back', rolled_back);
end;
$$;

-- "Start new day": closes every open ticket and restarts numbering at 001
create or replace function public.reset_daily()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date;
begin
  perform public._require_staff(array['GUARD', 'ADMIN']);
  perform public._lock_queue();
  today := public._office_today();

  update public.tickets
     set status = 'CANCELLED',
         completed_at = now(),
         notes = coalesce(notes || ' ', '') || '[Session Reset]'
   where status in ('WAITING', 'CALLED', 'SERVING', 'SKIPPED');

  update public.counters set current_ticket_id = null where current_ticket_id is not null;

  insert into public.queue_sequences (queue_type, current_seq, session_date)
  select q, 0, today from unnest(array['REGULAR', 'PRIORITY', 'COMPLAINT']) as q
  on conflict (queue_type) do update set current_seq = 0, session_date = excluded.session_date;

  -- The change feed only needs to cover what screens might have missed
  delete from public.queue_events where created_at < now() - interval '2 days';

  perform public._emit('RESET_DAILY');
  return jsonb_build_object('session_date', today);
end;
$$;

-- ---------------------------------------------------------------------
-- Counter stations
-- ---------------------------------------------------------------------

-- Finishes the current customer and calls the next one. A counter covering
-- for a paused partner calls Priority before Regular.
create or replace function public.call_next(p_counter_id int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  c public.counters;
  next_id bigint;
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  perform public._lock_queue();
  perform public._close_stale_tickets();

  c := public._counter_for(p_counter_id, u);
  perform public._require_active(c);
  perform public._finish_current(c);

  select id into next_id
    from public.tickets
   where status = 'WAITING'
     and session_date = public._office_today()
     and queue_type = any (public._servable_queue_types(c))
   order by case queue_type when 'PRIORITY' then 0 else 1 end, number_seq, id
   limit 1;

  if next_id is null then
    update public.counters set current_ticket_id = null where id = c.id;
    perform public._emit('NO_TICKETS_WAITING');
    return jsonb_build_object('ticket', null);
  end if;

  return jsonb_build_object('ticket', public._assign_ticket(c, next_id, u.username));
end;
$$;

-- Calls a specific waiting ticket out of order
create or replace function public.call_ticket(p_counter_id int, p_ticket_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  c public.counters;
  t public.tickets;
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  perform public._lock_queue();

  c := public._counter_for(p_counter_id, u);
  perform public._require_active(c);

  select * into t from public.tickets where id = p_ticket_id and status = 'WAITING';
  if t.id is null then
    raise exception 'Ticket not found or no longer waiting.' using errcode = 'P0002';
  end if;
  if not (t.queue_type = any (public._servable_queue_types(c))) then
    raise exception '% cannot serve % tickets.', c.name, lower(t.queue_type);
  end if;

  perform public._finish_current(c);
  return jsonb_build_object('ticket', public._assign_ticket(c, t.id, u.username));
end;
$$;

-- Repeats the announcement for the customer at the counter
create or replace function public.recall_ticket(p_counter_id int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  c public.counters;
  t public.tickets;
  payload jsonb;
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  c := public._counter_for(p_counter_id, u);

  select * into t from public.tickets where id = c.current_ticket_id;
  if t.id is null then
    raise exception 'Counter has no active ticket to recall.';
  end if;

  payload := jsonb_build_object(
    'id', t.id,
    'queue_number', t.queue_number,
    'queue_type', t.queue_type,
    'counter_id', c.id,
    'counter_name', c.name,
    'called_at', t.called_at
  );
  perform public._emit('RECALLED', payload);
  return jsonb_build_object('ticket', payload);
end;
$$;

-- Customer did not come forward: moves them to the on-hold list
create or replace function public.skip_ticket(p_counter_id int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  c public.counters;
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  perform public._lock_queue();
  c := public._counter_for(p_counter_id, u);

  if c.current_ticket_id is null then
    raise exception 'Counter has no active ticket to skip.';
  end if;

  update public.tickets set status = 'SKIPPED' where id = c.current_ticket_id;
  update public.counters set current_ticket_id = null where id = c.id;

  perform public._emit('SKIPPED');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.complete_ticket(p_counter_id int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  c public.counters;
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  perform public._lock_queue();
  c := public._counter_for(p_counter_id, u);

  if c.current_ticket_id is null then
    raise exception 'Counter has no active ticket to complete.';
  end if;

  update public.tickets set status = 'COMPLETED', completed_at = now() where id = c.current_ticket_id;
  update public.counters set current_ticket_id = null where id = c.id;

  perform public._emit('COMPLETED');
  return jsonb_build_object('ok', true);
end;
$$;

-- Calls an on-hold (skipped) customer back to the counter
create or replace function public.recall_skipped(p_counter_id int, p_ticket_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  c public.counters;
  t public.tickets;
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  perform public._lock_queue();

  c := public._counter_for(p_counter_id, u);
  perform public._require_active(c);

  select * into t from public.tickets where id = p_ticket_id and status = 'SKIPPED';
  if t.id is null then
    raise exception 'Skipped ticket not found or no longer on hold.' using errcode = 'P0002';
  end if;
  if not (t.queue_type = any (public._servable_queue_types(c))) then
    raise exception '% cannot serve % tickets.', c.name, lower(t.queue_type);
  end if;

  perform public._finish_current(c);
  return jsonb_build_object('ticket', public._assign_ticket(c, t.id, u.username));
end;
$$;

create or replace function public.mark_no_show(p_counter_id int, p_ticket_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  perform public._counter_for(p_counter_id, u);
  perform public._lock_queue();

  update public.tickets
     set status = 'CANCELLED',
         completed_at = now(),
         notes = coalesce(notes || ' ', '') || '[No Show]'
   where id = p_ticket_id and status = 'SKIPPED';
  if not found then
    raise exception 'Only on-hold (skipped) tickets can be marked as No Show.';
  end if;

  perform public._emit('NO_SHOW');
  return jsonb_build_object('ok', true);
end;
$$;

-- Sends the customer at the counter back to the waiting list of another queue
create or replace function public.transfer_ticket(
  p_counter_id int,
  p_ticket_id bigint,
  p_target_queue text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  c public.counters;
  target text := upper(p_target_queue);
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  if target is null or target not in ('REGULAR', 'PRIORITY', 'COMPLAINT') then
    raise exception 'Invalid target queue: %', p_target_queue using errcode = '22023';
  end if;
  perform public._lock_queue();
  c := public._counter_for(p_counter_id, u);

  update public.tickets
     set status = 'WAITING',
         queue_type = target,
         counter_id = null,
         notes = coalesce(notes || ' ', '')
                 || '[Transferred from ' || c.name
                 || coalesce(': ' || nullif(trim(p_notes), ''), '') || ']'
   where id = p_ticket_id and status in ('CALLED', 'SERVING');
  if not found then
    raise exception 'Only a ticket currently being served can be transferred.';
  end if;

  update public.counters
     set current_ticket_id = null
   where id = c.id and current_ticket_id = p_ticket_id;

  perform public._emit('TRANSFERRED');
  return jsonb_build_object('ok', true, 'target_queue', target);
end;
$$;

-- Pause / resume. While Counter 1 or 2 is paused, the other one calls its
-- customers. Counter 3 cannot pause because nobody covers complaints.
create or replace function public.set_counter_status(p_counter_id int, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.profiles;
  c public.counters;
  new_status text := upper(p_status);
  active_number text;
begin
  u := public._require_staff(array['COUNTER', 'ADMIN']);
  if new_status is null or new_status not in ('ACTIVE', 'PAUSED') then
    raise exception 'Status must be ACTIVE or PAUSED.' using errcode = '22023';
  end if;
  perform public._lock_queue();
  c := public._counter_for(p_counter_id, u);

  if c.queue_type not in ('REGULAR', 'PRIORITY') then
    raise exception '% cannot be paused - no other counter covers the % queue.', c.name, lower(c.queue_type);
  end if;

  if new_status = 'PAUSED' then
    select queue_number into active_number
      from public.tickets
     where id = c.current_ticket_id and status in ('CALLED', 'SERVING');
    if active_number is not null then
      raise exception 'Finish, skip or transfer % before pausing.', active_number;
    end if;

    if not exists (
      select 1 from public.counters
       where status = 'ACTIVE' and id <> c.id and queue_type in ('REGULAR', 'PRIORITY')
    ) then
      raise exception 'Cannot pause - no other active counter is left to cover this queue.';
    end if;
  end if;

  update public.counters set status = new_status where id = c.id;

  perform public._emit(case when new_status = 'PAUSED' then 'COUNTER_PAUSED' else 'COUNTER_RESUMED' end);
  return jsonb_build_object('counter_id', c.id, 'status', new_status);
end;
$$;

-- ---------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------

create or replace function public.update_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._require_staff(array['ADMIN']);

  insert into public.settings (key, value)
  select key, value from jsonb_each_text(p_settings)
  on conflict (key) do update set value = excluded.value;

  perform public._emit('SETTINGS_UPDATED');
  return (select jsonb_object_agg(key, value) from public.settings);
end;
$$;

create or replace function public.admin_metrics(p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date;
begin
  perform public._require_staff(array['ADMIN']);
  d := coalesce(p_date, public._office_today());

  return jsonb_build_object(
    'session_date', d,
    'status_counts', (
      select jsonb_build_object(
               'TOTAL', count(*),
               'WAITING', count(*) filter (where status = 'WAITING'),
               'CALLED', count(*) filter (where status = 'CALLED'),
               'SERVING', count(*) filter (where status = 'SERVING'),
               'COMPLETED', count(*) filter (where status = 'COMPLETED'),
               'SKIPPED', count(*) filter (where status = 'SKIPPED'),
               'CANCELLED', count(*) filter (where status = 'CANCELLED')
             )
        from public.tickets where session_date = d
    ),
    'queue_counts', (
      select jsonb_build_object(
               'REGULAR', count(*) filter (where queue_type = 'REGULAR'),
               'PRIORITY', count(*) filter (where queue_type = 'PRIORITY'),
               'COMPLAINT', count(*) filter (where queue_type = 'COMPLAINT')
             )
        from public.tickets where session_date = d
    ),
    'counter_performance', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'counter_id', c.id,
               'counter_name', c.name,
               'served_count', (
                 select count(*) from public.tickets t
                  where t.counter_id = c.id and t.status = 'COMPLETED' and t.session_date = d
               )
             ) order by c.id), '[]'::jsonb)
        from public.counters c
    ),
    'avg_wait_minutes', (
      select coalesce(round((avg(extract(epoch from called_at - created_at)) / 60)::numeric, 1), 0)
        from public.tickets where session_date = d and called_at is not null
    ),
    'avg_service_minutes', (
      select coalesce(round((avg(extract(epoch from completed_at - called_at)) / 60)::numeric, 1), 0)
        from public.tickets
       where session_date = d and called_at is not null and completed_at is not null and status = 'COMPLETED'
    )
  );
end;
$$;

create or replace function public.ticket_history(p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d date;
begin
  perform public._require_staff(array['ADMIN']);
  d := coalesce(p_date, public._office_today());

  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id desc), '[]'::jsonb)
      from (
        select t.id, t.queue_number, t.queue_type, t.session_date, t.number_seq, t.status,
               t.created_at, t.called_at, t.serving_at, t.completed_at,
               t.counter_id, c.name as counter_name, t.called_by_user, t.notes
          from public.tickets t
          left join public.counters c on c.id = t.counter_id
         where t.session_date = d
      ) r
  );
end;
$$;

create or replace function public.list_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._require_staff(array['ADMIN']);
  return (
    select coalesce(jsonb_agg(to_jsonb(p) order by p.role, p.username), '[]'::jsonb)
      from public.profiles p
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Who may call what. Supabase lets anon + authenticated execute new
-- functions by default, so take that away and grant only what apps use.
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.queue_snapshot() to anon, authenticated;

grant execute on function
  public.generate_ticket(text, text),
  public.void_ticket(bigint),
  public.reset_daily(),
  public.call_next(int),
  public.call_ticket(int, bigint),
  public.recall_ticket(int),
  public.skip_ticket(int),
  public.complete_ticket(int),
  public.recall_skipped(int, bigint),
  public.mark_no_show(int, bigint),
  public.transfer_ticket(int, bigint, text, text),
  public.set_counter_status(int, text),
  public.update_settings(jsonb),
  public.admin_metrics(date),
  public.ticket_history(date),
  public.list_staff()
to authenticated;
