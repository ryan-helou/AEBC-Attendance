-- Guest gender migration
-- Run this in the Supabase dashboard → SQL Editor, then deploy the app.
-- Safe to re-run (idempotent).

-- Guests are anonymous, so their gender can't be looked up on the people table
-- the way a named attendee's is. Storing it on the check-in itself lets guests
-- count toward the M/F split on the attendance page and the Gender Breakdown
-- chart, instead of silently dropping out of it.
-- NULL = not recorded, which is what every existing guest row stays as.
alter table guest_attendance
  add column if not exists gender text check (gender in ('male', 'female'));
