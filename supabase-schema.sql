-- AEBC Attendance - Supabase Schema
-- Run this in your Supabase SQL Editor (https://app.supabase.com → SQL Editor)

-- 1. Meetings table
create table meetings (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  display_order integer not null default 0
);

-- Pre-seed the 3 meetings
insert into meetings (name, display_order) values
  ('English Sunday Service', 1),
  ('Arabic Sunday Service', 2),
  ('Shabibeh Service', 3);

-- 2. People table
create table people (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  phone text,
  notes text,
  created_at timestamptz default now()
);

create index idx_people_full_name on people (full_name);

-- 3. Attendance records table
create table attendance_records (
  id uuid default gen_random_uuid() primary key,
  meeting_id uuid not null references meetings(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  date date not null default current_date,
  marked_at timestamptz default now(),
  constraint unique_attendance unique (meeting_id, person_id, date)
);

create index idx_attendance_meeting_date on attendance_records (meeting_id, date);

-- 4. App config (key/value store for access key)
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

-- 6. Enable realtime on attendance_records
-- Go to Database → Replication in the Supabase dashboard and enable replication for attendance_records
-- Or run:
alter publication supabase_realtime add table attendance_records;
