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
  'Preacher',
  'Live Stream',
  'PowerPoint',
  'Usher',
  'Announcements',
] as const;

// Instrument-playing roles only. Sound, Usher and the vocal roles are valid
// assignable roles with their own leaderboards, but none of them count toward
// Top Musicians — Singer/Backup Singer are ranked on Top Singers instead.
export const PLAYING_MUSICIAN_ROLES = [
  'Piano',
  'Guitar',
  'Bass',
  'Drums',
  'Keyboard',
  'Violin',
] as const;

export const SINGING_ROLES = ['Singer', 'Backup Singer'] as const;

export type MusicianRole = (typeof MUSICIAN_ROLES)[number];

/**
 * The same 15 roles, grouped for the assign-role picker. Fifteen identical pills
 * in one wrapped cloud means reading every label to find one; four labelled
 * clusters means looking in one place. Order within a group is deliberate —
 * whatever gets assigned most often sits first.
 *
 * MUSICIAN_ROLES stays the flat source of truth; the dev-only check below fails
 * loudly if a role is ever added there and forgotten here.
 */
export const ROLE_GROUPS: ReadonlyArray<{ label: string; roles: readonly MusicianRole[] }> = [
  { label: 'Music', roles: ['Piano', 'Guitar', 'Drums', 'Bass', 'Keyboard', 'Violin'] },
  { label: 'Vocals', roles: ['Singer', 'Backup Singer'] },
  { label: 'Tech', roles: ['Sound', 'Live Stream', 'PowerPoint'] },
  { label: 'Serving', roles: ['Preacher', 'Attendance', 'Usher', 'Announcements'] },
];

if (import.meta.env.DEV) {
  const grouped = ROLE_GROUPS.flatMap(g => g.roles);
  const missing = MUSICIAN_ROLES.filter(r => !grouped.includes(r));
  if (missing.length || grouped.length !== MUSICIAN_ROLES.length) {
    console.error('ROLE_GROUPS is out of sync with MUSICIAN_ROLES; ungrouped:', missing);
  }
}

interface MusicianRoleEntry {
  id: string;
  person_id: string;
  role: MusicianRole;
}

export function useMusicianRoles(meetingId: string, date: string) {
  // Map<personId, MusicianRoleEntry[]>
  const [roles, setRoles] = useState<Map<string, MusicianRoleEntry[]>>(new Map());
  const rolesRef = useRef<Map<string, MusicianRoleEntry[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('musician_roles')
        .select('id, person_id, role')
        .eq('meeting_id', meetingId)
        .eq('date', date);

      if (data) {
        const map = new Map<string, MusicianRoleEntry[]>();
        for (const row of data) {
          const entry = row as MusicianRoleEntry;
          const list = map.get(entry.person_id) || [];
          list.push(entry);
          map.set(entry.person_id, list);
        }
        rolesRef.current = map;
        setRoles(map);
      }
      setLoading(false);
    }
    load();
  }, [meetingId, date]);

  const toggleRole = useCallback(
    async (personId: string, role: MusicianRole) => {
      const entries = rolesRef.current.get(personId) || [];
      const existing = entries.find(e => e.role === role);

      if (existing) {
        // Remove this role
        await supabase.from('musician_roles').delete().eq('id', existing.id);
        setRoles(prev => {
          const next = new Map(prev);
          const updated = (next.get(personId) || []).filter(e => e.id !== existing.id);
          if (updated.length === 0) {
            next.delete(personId);
          } else {
            next.set(personId, updated);
          }
          rolesRef.current = next;
          return next;
        });
      } else {
        // Add this role
        const { data } = await supabase
          .from('musician_roles')
          .insert({ meeting_id: meetingId, person_id: personId, date, role })
          .select('id, person_id, role')
          .single();
        if (data) {
          setRoles(prev => {
            const next = new Map(prev);
            const list = [...(next.get(personId) || []), data as MusicianRoleEntry];
            next.set(personId, list);
            rolesRef.current = next;
            return next;
          });
        }
      }
    },
    [meetingId, date]
  );

  const getRoles = useCallback(
    (personId: string): MusicianRole[] => {
      return (roles.get(personId) || []).map(e => e.role);
    },
    [roles]
  );

  return { roles, loading, toggleRole, getRoles };
}
