# AEBC Attendance

*A check-in app for a church that runs two weekly gatherings — the English Sunday Service and the Saturday-evening Shabibeh (youth) service.*

Whoever's on the door opens the service for today's date and starts typing names. The app autocompletes against a shared directory of people, and a tap marks someone present. Walk-ins nobody recognizes get added as numbered guests and can be converted to named people once you learn who they are. The running tally shows how many are present, how many are first-timers, the male/female split, and what share arrived on time — before 10:30 AM for the Sunday service, before 7:30 PM for Shabibeh — with every check-in time pinned to Eastern Time so the math holds regardless of the volunteer's device. Cross 25, 50, 75, or 100 present and confetti fires.

Everything lives in Supabase (Postgres plus realtime), so two people checking arrivals at the same door stay in sync. The data model is small and legible: `people`, `meetings`, `attendance_records` (one row per person per service date, carrying a first-time flag and a check-in timestamp), `guest_attendance`, per-service `meeting_notes` (a note, who took the count, an optional manual total), and `musician_roles` for who played what on a given Sunday. There are no per-user accounts — a shared access key gets a volunteer in, which is about the right amount of friction for a table by the door.

Beyond taking attendance, the app carries:

- a history view built on Recharts — weekly attendance lines, on-time trends, and longest/current streaks that bridge weeks a service wasn't held
- a follow-up committee dashboard, behind its own password, that surfaces people who've come at least three times but haven't been seen in 2 to 8 weeks, lets members flag and assign them, and keeps a shared notes log that syncs live across the committee
- a directory manager with comma-separated bulk import and a duplicate-merge that combines two people's attendance history into one
- an accent-colour picker (13 hues × 5 shades, saved per browser) and a small arcade — Tetris, Breakout, a chess puzzle rush, Wordle — tucked away for slow moments before a service

Built with React 19, TypeScript and Vite, installable as a PWA, and deployed on Vercel.
