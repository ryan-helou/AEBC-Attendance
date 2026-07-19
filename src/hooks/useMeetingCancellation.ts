import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/** Reads the cancellation row for a service occurrence, or null if it was held. */
async function loadCancellation(meetingId: string, date: string) {
  const { data, error } = await supabase
    .from('meeting_cancellations')
    .select('reason')
    .eq('meeting_id', meetingId)
    .eq('date', date)
    .maybeSingle();

  // An error here usually means the table doesn't exist yet (pre-migration).
  // Treat it as "not cancelled" rather than breaking the attendance page.
  if (error || !data) return null;
  return { reason: (data.reason as string) ?? null };
}

/**
 * Whether a given service occurrence was cancelled, backed by the
 * meeting_cancellations table.
 */
export function useMeetingCancellation(meetingId: string, date: string) {
  const [cancellation, setCancellation] = useState<{ reason: string | null } | null>(null);

  // Guarded so a slow response for a previous date can't overwrite the current
  // one — the ‹ › arrows can switch dates faster than a request round-trips.
  useEffect(() => {
    let active = true;
    (async () => {
      const result = await loadCancellation(meetingId, date);
      if (active) setCancellation(result);
    })();
    return () => {
      active = false;
    };
  }, [meetingId, date]);

  const cancelService = useCallback(
    async (reason: string) => {
      const trimmed = reason.trim();
      const { error } = await supabase
        .from('meeting_cancellations')
        .upsert(
          { meeting_id: meetingId, date, reason: trimmed || null },
          { onConflict: 'meeting_id,date' },
        );
      if (error) return false;
      setCancellation(await loadCancellation(meetingId, date));
      return true;
    },
    [meetingId, date],
  );

  const restoreService = useCallback(async () => {
    const { error } = await supabase
      .from('meeting_cancellations')
      .delete()
      .eq('meeting_id', meetingId)
      .eq('date', date);
    if (error) return false;
    setCancellation(await loadCancellation(meetingId, date));
    return true;
  }, [meetingId, date]);

  return { cancellation, cancelService, restoreService };
}
