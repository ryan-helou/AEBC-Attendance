-- AEBC Attendance - Supabase Schema
-- Run this in your Supabase SQL Editor (https://app.supabase.com → SQL Editor)

-- 1. Meetings table
create table meetings (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  display_order integer not null default 0
);

-- Pre-seed the 2 meetings
insert into meetings (name, display_order) values
  ('English Sunday Service', 1),
  ('Shabibeh Service', 2);

-- 2. People table
create table people (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  notes text,
  gender text check (gender in ('male', 'female')),
  baby boolean not null default false,
  created_at timestamptz default now()
);

create index idx_people_full_name on people (full_name);

-- Migration for existing databases: add gender column if missing
alter table people add column if not exists gender text check (gender in ('male', 'female'));

-- Migration for existing databases: add baby flag if missing
alter table people add column if not exists baby boolean not null default false;

-- 3. Attendance records table
create table attendance_records (
  id uuid default gen_random_uuid() primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  date date not null default current_date,
  marked_at timestamptz default now(),
  first_time boolean not null default false,
  constraint unique_attendance unique (meeting_id, person_id, date)
);

create index idx_attendance_meeting_date on attendance_records (meeting_id, date);

-- 4. Guest attendance (anonymous walk-ins)
create table guest_attendance (
  id uuid default gen_random_uuid() primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  date date not null default current_date,
  guest_number integer not null,
  marked_at timestamptz default now(),
  first_time boolean not null default false
);

create index idx_guest_attendance_meeting_date on guest_attendance (meeting_id, date);

-- 5. Meeting notes (one short note per service date)
create table meeting_notes (
  id uuid default gen_random_uuid() primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  date date not null,
  note text,
  taken_by text,
  manual_count integer,
  created_at timestamptz default now(),
  constraint unique_meeting_note unique (meeting_id, date)
);

create policy "Allow all on meeting_notes" on meeting_notes for all using (true) with check (true);
alter table meeting_notes enable row level security;

-- 5. App config (key/value store for access key)
create table app_config (
  key text primary key,
  value text not null
);

insert into app_config (key, value) values ('access_key', '3200');

-- 5. RLS policies (allow all for anon - access control is app-level)
alter table meetings enable row level security;
alter table people enable row level security;
alter table attendance_records enable row level security;
alter table app_config enable row level security;

create policy "Allow all on meetings" on meetings for all using (true) with check (true);
create policy "Allow all on people" on people for all using (true) with check (true);
create policy "Allow all on attendance_records" on attendance_records for all using (true) with check (true);
create policy "Allow all on app_config" on app_config for all using (true) with check (true);

alter table guest_attendance enable row level security;
create policy "Allow all on guest_attendance" on guest_attendance for all using (true) with check (true);

-- 6. Enable realtime on attendance_records
-- Go to Database → Replication in the Supabase dashboard and enable replication for attendance_records
-- Or run:
alter publication supabase_realtime add table attendance_records;
alter publication supabase_realtime add table guest_attendance;

-- 7. Musician roles (who played what per service date)
create table musician_roles (
  id uuid default gen_random_uuid() primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  date date not null,
  role text not null,
  constraint unique_musician_person_role unique (meeting_id, person_id, date, role)
);

create index idx_musician_roles_meeting_date on musician_roles (meeting_id, date);

alter table musician_roles enable row level security;
create policy "Allow all on musician_roles" on musician_roles for all using (true) with check (true);

-- 8. Follow-up dashboard
-- Committee members (the editable list authors/assignees are chosen from)
create table followup_members (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now()
);

-- Current follow-up state for a person (one row per person, created lazily)
create table followup_status (
  person_id uuid primary key references people(id) on delete cascade,
  needs_followup boolean not null default false,
  assigned_to uuid references followup_members(id) on delete set null,
  dismissed boolean not null default false,
  updated_at timestamptz default now()
);

-- Migration for existing databases: add dismissed column if missing
alter table followup_status add column if not exists dismissed boolean not null default false;

-- Follow-up history log (comments left over time)
create table followup_notes (
  id uuid default gen_random_uuid() primary key,
  person_id uuid not null references people(id) on delete cascade,
  author_id uuid references followup_members(id) on delete set null,
  body text not null,
  created_at timestamptz default now()
);

create index idx_followup_notes_person on followup_notes (person_id, created_at desc);

alter table followup_members enable row level security;
alter table followup_status enable row level security;
alter table followup_notes enable row level security;
create policy "Allow all on followup_members" on followup_members for all using (true) with check (true);
create policy "Allow all on followup_status" on followup_status for all using (true) with check (true);
create policy "Allow all on followup_notes" on followup_notes for all using (true) with check (true);

-- Live sync across committee members
alter publication supabase_realtime add table followup_status;
alter publication supabase_realtime add table followup_notes;
alter publication supabase_realtime add table followup_members;

-- Follow-up committee ideas / to-do list (separate from the attendance ideas)
create table followup_ideas (
  id uuid default gen_random_uuid() primary key,
  text text not null,
  done boolean not null default false,
  created_at timestamptz default now()
);

alter table followup_ideas enable row level security;
create policy "Allow all on followup_ideas" on followup_ideas for all using (true) with check (true);

-- Follow-up dashboard password. Set this manually with your chosen key:
-- insert into app_config (key, value) values ('followup_access_key', '<choose-a-password>');
