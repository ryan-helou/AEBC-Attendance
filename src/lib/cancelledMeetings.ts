export interface CancelledMeeting {
  /** Case-insensitive substring matched against the meeting name. */
  meetingMatch: string;
  /** Service date in YYYY-MM-DD. */
  date: string;
  /** Short hardcoded reason shown to the user (optional). */
  reason?: string;
}

// Hardcoded cancelled service occurrences. A cancelled meeting shows a fixed
// "Cancelled" state in the app instead of relying on a freeform service note,
// so cancellations are explicit and consistent rather than typed by hand.
export const CANCELLED_MEETINGS: CancelledMeeting[] = [
  { meetingMatch: 'shabibeh', date: '2026-06-06', reason: 'Renewed' },
];

/** Returns the cancellation for a given meeting/date, or null if it was held. */
export function getCancellation(
  meetingName: string | undefined | null,
  date: string | undefined | null,
): CancelledMeeting | null {
  if (!meetingName || !date) return null;
  const name = meetingName.toLowerCase();
  return (
    CANCELLED_MEETINGS.find(
      c => c.date === date && name.includes(c.meetingMatch.toLowerCase()),
    ) ?? null
  );
}
