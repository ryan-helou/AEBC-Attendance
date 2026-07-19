-- Service settings migration
-- Run this in the Supabase dashboard → SQL Editor, then deploy the app.
-- Safe to re-run (idempotent).

-- 1. Cancelled service occurrences -------------------------------------------
-- Replaces the hardcoded CANCELLED_MEETINGS array in src/lib/cancelledMeetings.ts
-- so cancellations can be set from the app instead of requiring a code deploy.
create table if not exists meeting_cancellations (
  id uuid default gen_random_uuid() primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz default now(),
  constraint unique_meeting_cancellation unique (meeting_id, date)
);

create index if not exists idx_meeting_cancellations_meeting_date
  on meeting_cancellations (meeting_id, date);

alter table meeting_cancellations enable row level security;

drop policy if exists "Allow all on meeting_cancellations" on meeting_cancellations;
create policy "Allow all on meeting_cancellations"
  on meeting_cancellations for all using (true) with check (true);

-- Migrate the one previously-hardcoded cancellation so nothing regresses.
insert into meeting_cancellations (meeting_id, date, reason)
select id, date '2026-06-06', 'Renewed'
from meetings
where name ilike '%shabibeh%'
on conflict (meeting_id, date) do nothing;

-- 2. Per-meeting on-time cutoff ----------------------------------------------
-- Minutes since midnight, Eastern Time. NULL = don't show an on-time stat.
-- Replaces brittle meeting-NAME string matching in dateUtils.onTimeCutoffMinutes,
-- which silently broke the stat if a meeting was ever renamed.
alter table meetings add column if not exists on_time_cutoff_minutes integer;

-- Seed with the values the old name-matching produced, so behaviour is unchanged.
update meetings
set on_time_cutoff_minutes = 10 * 60 + 30            -- 10:30 AM
where on_time_cutoff_minutes is null
  and (name ilike '%english%' or name ilike '%sunday%');

update meetings
set on_time_cutoff_minutes = 19 * 60 + 30            -- 7:30 PM
where on_time_cutoff_minutes is null
  and (name ilike '%shabibeh%' or name ilike '%saturday%');
