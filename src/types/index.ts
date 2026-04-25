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
