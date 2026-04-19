import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const MUSICIAN_ROLES = [
  'Piano',
  'Guitar',
  'Bass',
  'Drums',
  'Keyboard',
  'Violin',
  'Singer',
  'Backup Singer',
  'Sound',
  'Attendance',
] as const;

export type MusicianRole = (typeof MUSICIAN_ROLES)[number];

interface MusicianRoleEntry {
  id: string;
  person_id: string;
  role: MusicianRole;
}

export function useMusicianRoles(meetingId: string, date: string) {
  const [roles, setRoles] = useState<Map<string, MusicianRoleEntry>>(new Map());
  const rolesRef = useRef<Map<string, MusicianRoleEntry>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('musician_roles')
        .select('id, person_id, role')
        .eq('meeting_id', meetingId)
        .eq('date', date);

      if (data) {
        const map = new Map<string, MusicianRoleEntry>();
        for (const row of data) {
          map.set(row.person_id, row as MusicianRoleEntry);
        }
        rolesRef.current = map;
        setRoles(map);
      }
      setLoading(false);
    }
    load();
  }, [meetingId, date]);

  const setRole = useCallback(
    async (personId: string, role: MusicianRole) => {
      const existing = rolesRef.current.get(personId);
      if (existing) {
        await supabase.from('musician_roles').update({ role }).eq('id', existing.id);
        const entry = { ...existing, role };
        setRoles(prev => {
          const next = new Map(prev);
          next.set(personId, entry);
          rolesRef.current = next;
          return next;
        });
      } else {
        const { data } = await supabase
          .from('musician_roles')
          .upsert(
            { meeting_id: meetingId, person_id: personId, date, role },
            { onConflict: 'meeting_id,person_id,date' }
          )
          .select('id, person_id, role')
          .single();
        if (data) {
          setRoles(prev => {
            const next = new Map(prev);
            next.set(personId, data as MusicianRoleEntry);
            rolesRef.current = next;
            return next;
          });
        }
      }
    },
    [meetingId, date]
  );

  const removeRole = useCallback(
    async (personId: string) => {
      const existing = rolesRef.current.get(personId);
      if (!existing) return;
      await supabase.from('musician_roles').delete().eq('id', existing.id);
      setRoles(prev => {
        const next = new Map(prev);
        next.delete(personId);
        rolesRef.current = next;
        return next;
      });
    },
    []
  );

  const getRole = useCallback(
    (personId: string): MusicianRole | null => {
      return roles.get(personId)?.role ?? null;
    },
    [roles]
  );

  return { roles, loading, setRole, removeRole, getRole };
}
