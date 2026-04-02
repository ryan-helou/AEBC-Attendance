import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { GuestEntry } from '../types';

export function useGuestAttendance(meetingId: string, date: string) {
  const [guests, setGuests] = useState<GuestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const meetingIdRef = useRef(meetingId);
  meetingIdRef.current = meetingId;

  const fetchGuests = useCallback(async () => {
    const { data } = await supabase
      .from('guest_attendance')
      .select('*')
      .eq('meeting_id', meetingId)
      .eq('date', date)
      .order('marked_at', { ascending: false });

    if (data) {
      setGuests(data as GuestEntry[]);
    }
    setLoading(false);
  }, [meetingId, date]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`guests-${meetingId}-${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guest_attendance',
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          const record = payload.new as Record<string, unknown> | undefined;
          const oldRecord = payload.old as Record<string, unknown> | undefined;

          if (record && (record.date as string) !== date) return;
          if (payload.eventType === 'DELETE' && oldRecord && (oldRecord.date as string) !== date) return;

          fetchGuests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, date, fetchGuests]);

  const addGuest = useCallback(async () => {
    // Determine next guest number
    const nextNumber = guests.length > 0
      ? Math.max(...guests.map(g => g.guest_number)) + 1
      : 1;

    const tempId = `temp-guest-${Date.now()}`;
    const tempEntry: GuestEntry = {
      id: tempId,
      meeting_id: meetingId,
      date,
      guest_number: nextNumber,
      marked_at: new Date().toISOString(),
      first_time: true,
    };

    setGuests(prev => [tempEntry, ...prev]);

    const { data, error } = await supabase
      .from('guest_attendance')
      .insert({
        meeting_id: meetingId,
        date,
        guest_number: nextNumber,
        first_time: true,
      })
      .select()
      .single();

    if (error) {
      setGuests(prev => prev.filter(g => g.id !== tempId));
      return;
    }

    if (data) {
      setGuests(prev => prev.map(g => (g.id === tempId ? (data as GuestEntry) : g)));
    }
  }, [meetingId, date, guests]);

  const removeGuest = useCallback(
    async (guestId: string) => {
      setGuests(prev => prev.filter(g => g.id !== guestId));
      await supabase.from('guest_attendance').delete().eq('id', guestId);
    },
    []
  );

  const updateGuestMarkedAt = useCallback(
    async (guestId: string, newMarkedAt: string) => {
      setGuests(prev =>
        [...prev.map(g => (g.id === guestId ? { ...g, marked_at: newMarkedAt } : g))]
          .sort((a, b) => new Date(b.marked_at).getTime() - new Date(a.marked_at).getTime())
      );

      await supabase
        .from('guest_attendance')
        .update({ marked_at: newMarkedAt })
        .eq('id', guestId);

      fetchGuests();
    },
    [fetchGuests]
  );

  const toggleGuestFirstTime = useCallback(
    async (guestId: string) => {
      const guest = guests.find(g => g.id === guestId);
      if (!guest) return;
      const newVal = !guest.first_time;
      setGuests(prev => prev.map(g => (g.id === guestId ? { ...g, first_time: newVal } : g)));
      await supabase
        .from('guest_attendance')
        .update({ first_time: newVal })
        .eq('id', guestId);
    },
    [guests]
  );

  return { guests, loading, addGuest, removeGuest, updateGuestMarkedAt, toggleGuestFirstTime };
}
