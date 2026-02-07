export interface Meeting {
  id: string;
  name: string;
  display_order: number;
}

export interface Person {
  id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  meeting_id: string;
  person_id: string;
  date: string;
  marked_at: string;
}

export interface AttendanceEntry extends AttendanceRecord {
  person: Person;
}
