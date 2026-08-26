# AEBC Attendance — start here

## Read the transfer brief before doing anything

**`~/Developer/CLAUDE_TRANSFER_AUG25/AEBC-ATTENDANCE.md`** is the full brain-dump for this
repo: what the app is, the data model, the house conventions, how to verify a change when
the app is behind a password gate, and every gotcha that has cost real time. Read it in
full at the start of a session here.

Mirror (git-tracked, survives anything happening in `~/Developer`):
`~/Developer/brain/projects/AEBC-Attendance/CLAUDE_TRANSFER_AUG25_AEBC-ATTENDANCE.md`

Project memory: `~/.claude/projects/-Users-ryanhelou-Developer-AEBC-Attendance/memory/`
· Vault: `~/Developer/brain/projects/AEBC-Attendance/`

## The rules you cannot get wrong

- **Times are Eastern, always.** Every render and calculation goes through
  `src/lib/dateUtils.ts` (`formatTimeET`, `minutesSinceMidnightET`, `toTimeInputValueET`,
  `etWallClockToISO`). Never `new Date(x).toLocaleTimeString()` / `.getHours()`. A record
  with no `marked_at` renders **blank** — never "1:00 AM" — and is excluded from on-time
  and average-arrival maths.
- **Every aggregate query goes through `fetchAllRows()`** (`src/lib/supabase.ts`).
  PostgREST silently truncates at 1000 rows and corrupts any client-side total.
- **Confirm before deleting** via `ConfirmDialog` — everywhere **except** the live
  AttendancePage, where removals are instant (the undo toast covers it).
- **A service that didn't happen is not a zero.** Cancellations and non-meeting weeks are
  `null` — dropped or bridged — in every chart, streak and average.
- **`npm run build` (`tsc -b && vite build`) is the only gate.** There are no tests. Run it
  before you call anything done.
- **Migrations are manual**: edit `supabase-schema.sql` idempotently, then tell Ryan to run
  it in the Supabase SQL editor. Type new columns as optional (`col?: T | null`) so a
  deploy that lands before the migration still works.
- **Commit and push automatically** when work is finished — prose commit message
  explaining the *why*, plus the `Co-Authored-By` trailer. Don't ask first.

## When the whole app shows "no data"

The free-tier Supabase project has auto-paused; it is not a code bug. Check with
`nslookup <project-ref>.supabase.co 8.8.8.8` — NXDOMAIN means paused. Only Ryan can resume
it (Supabase dashboard → Restore). Details in the project memory file
`supabase-backend-pause.md`.
