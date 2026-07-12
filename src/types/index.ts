export interface Meeting {
  id: string;
  name: string;
  display_order: number;
}

export type Gender = 'male' | 'female';

export interface Person {
  id: string;
  full_name: string;
  notes: string | null;
  gender: Gender | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  meeting_id: string;
  person_id: string;
  date: string;
  marked_at: string;
  first_time: boolean;
}

export interface AttendanceEntry extends AttendanceRecord {
  person: Person;
}

export interface GuestEntry {
  id: string;
  meeting_id: string;
  date: string;
  guest_number: number;
  marked_at: string;
  first_time: boolean;
}

export type DisplayEntry =
  | { type: 'person'; entry: AttendanceEntry }
  | { type: 'guest'; entry: GuestEntry };

// --- Follow-up dashboard ---

export interface FollowupMember {
  id: string;
  name: string;
  created_at: string;
}

export interface FollowupStatus {
  person_id: string;
  needs_followup: boolean;
  assigned_to: string | null; // FollowupMember.id
  dismissed: boolean; // removed from the watch list (kept for restore)
  updated_at: string;
}

export interface FollowupNote {
  id: string;
  person_id: string;
  author_id: string | null; // FollowupMember.id (null if the member was removed)
  body: string;
  created_at: string;
}

/** A merged row rendered in the watch list (attendance metrics + follow-up state). */
export interface WatchListEntry {
  person_id: string;
  person_name: string;
  totalAttendances: number;
  lastSeenDate: string | null;
  weeksSinceLast: number;
  needs_followup: boolean;
  assigned_to: string | null;
  dismissed: boolean;
  latestNotePreview: string | null;
  /** true when the person qualifies via the inactivity cutoff (vs only manually flagged). */
  isInactiveByCutoff: boolean;
}
