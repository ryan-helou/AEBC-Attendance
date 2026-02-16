import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { AttendanceEntry } from '../types';

export function useAttendance(meetingId: string, date: string) {
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [markedPersonIds, setMarkedPersonIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const meetingIdRef = useRef(meetingId);
  meetingIdRef.current = meetingId;

  const fetchAttendance = useCallback(async () => {
    const { data } = await supabase
      .from('attendance_records')
      .select('*, person:people(*)')
      .eq('meeting_id', meetingId)
      .eq('date', date)
      .order('marked_at', { ascending: false });

    if (data) {
      const mapped: AttendanceEntry[] = data.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        meeting_id: r.meeting_id as string,
        person_id: r.person_id as string,
        date: r.date as string,
        marked_at: r.marked_at as string,
        person: r.person as AttendanceEntry['person'],
      }));
      setEntries(mapped);
      setMarkedPersonIds(new Set(mapped.map(e => e.person_id)));
    }

    setLoading(false);
  }, [meetingId, date]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`attendance-${meetingId}-${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          const record = payload.new as Record<string, unknown> | undefined;
          const oldRecord = payload.old as Record<string, unknown> | undefined;

          if (record && (record.date as string) !== date) return;
          if (payload.eventType === 'DELETE' && oldRecord && (oldRecord.date as string) !== date) return;

          fetchAttendance();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, date, fetchAttendance]);

  const markAttendance = useCallback(
    async (personId: string, person: AttendanceEntry['person']): Promise<boolean> => {
      const tempId = `temp-${Date.now()}`;
      const tempEntry: AttendanceEntry = {
        id: tempId,
        meeting_id: meetingId,
        person_id: personId,
        date,
        marked_at: new Date().toISOString(),
        person,
      };

      setEntries(prev => [tempEntry, ...prev]);
      setMarkedPersonIds(prev => new Set(prev).add(personId));

      const { data, error } = await supabase
        .from('attendance_records')
        .insert({
          meeting_id: meetingId,
          person_id: personId,
          date,
        })
        .select('*, person:people(*)')
        .single();

      if (error) {
        if (error.code === '23505') {
          fetchAttendance();
          return false;
        }
        setEntries(prev => prev.filter(e => e.id !== tempId));
        setMarkedPersonIds(prev => {
          const next = new Set(prev);
          next.delete(personId);
          return next;
        });
        return false;
      }

      if (data) {
        const real: AttendanceEntry = {
          id: (data as Record<string, unknown>).id as string,
          meeting_id: (data as Record<string, unknown>).meeting_id as string,
          person_id: (data as Record<string, unknown>).person_id as string,
          date: (data as Record<string, unknown>).date as string,
          marked_at: (data as Record<string, unknown>).marked_at as string,
          person: (data as Record<string, unknown>).person as AttendanceEntry['person'],
        };
        setEntries(prev => prev.map(e => (e.id === tempId ? real : e)));
      }

      return true;
    },
    [meetingId, date, fetchAttendance]
  );

  const [pendingUndo, setPendingUndo] = useState<{
    entry: AttendanceEntry;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);

  const commitRemove = useCallback(
    async (recordId: string) => {
      const { error } = await supabase
        .from('attendance_records')
        .delete()
        .eq('id', recordId);

      if (error) {
        fetchAttendance();
      }
      setPendingUndo(null);
    },
    [fetchAttendance]
  );

  const removeAttendance = useCallback(
    (recordId: string) => {
      // If there's already a pending undo, commit it immediately
      if (pendingUndo) {
        clearTimeout(pendingUndo.timeoutId);
        commitRemove(pendingUndo.entry.id);
      }

      const entry = entries.find(e => e.id === recordId);
      setEntries(prev => prev.filter(e => e.id !== recordId));
      if (entry) {
        setMarkedPersonIds(prev => {
          const next = new Set(prev);
          next.delete(entry.person_id);
          return next;
        });

        const timeoutId = setTimeout(() => {
          commitRemove(recordId);
        }, 4000);

        setPendingUndo({ entry, timeoutId });
      }
    },
    [entries, pendingUndo, commitRemove]
  );

  const undoRemove = useCallback(() => {
    if (!pendingUndo) return;
    clearTimeout(pendingUndo.timeoutId);
    const { entry } = pendingUndo;
    setEntries(prev => {
      const restored = [...prev, entry].sort(
        (a, b) => new Date(b.marked_at).getTime() - new Date(a.marked_at).getTime()
      );
      return restored;
    });
    setMarkedPersonIds(prev => new Set(prev).add(entry.person_id));
    setPendingUndo(null);
  }, [pendingUndo]);

  const dismissUndo = useCallback(() => {
    if (!pendingUndo) return;
    clearTimeout(pendingUndo.timeoutId);
    commitRemove(pendingUndo.entry.id);
  }, [pendingUndo, commitRemove]);

  return { entries, markedPersonIds, loading, markAttendance, removeAttendance, pendingUndo: pendingUndo?.entry ?? null, undoRemove, dismissUndo };
}
