import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase, fetchAllRows } from '../lib/supabase';
import { computeInactivePeople, type InactivityRow } from '../lib/inactivity';
import { getTodayDate } from '../lib/dateUtils';
import type { FollowupMember, FollowupStatus, FollowupNote, WatchListEntry } from '../types';

const WEEK_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Owns all follow-up dashboard data. The heavy attendance aggregation is fetched
 * once and cached; the watch list is recomputed in memory when the cutoff (or
 * any follow-up table) changes — no refetch of attendance on cutoff changes.
 */
export function useFollowUps(cutoffWeeks: number) {
  const [attendanceRows, setAttendanceRows] = useState<InactivityRow[]>([]);
  const [peopleById, setPeopleById] = useState<Map<string, string>>(new Map());
  const [statuses, setStatuses] = useState<FollowupStatus[]>([]);
  const [notes, setNotes] = useState<FollowupNote[]>([]);
  const [members, setMembers] = useState<FollowupMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Small follow-up tables — reloaded after mutations and on realtime events.
  const loadFollowupTables = useCallback(async () => {
    const [statusRes, notesRes, membersRes] = await Promise.all([
      supabase.from('followup_status').select('*'),
      supabase.from('followup_notes').select('*').order('created_at', { ascending: false }),
      supabase.from('followup_members').select('*').order('name'),
    ]);
    setStatuses((statusRes.data as FollowupStatus[]) ?? []);
    setNotes((notesRes.data as FollowupNote[]) ?? []);
    setMembers((membersRes.data as FollowupMember[]) ?? []);
  }, []);

  // Heavy attendance aggregation + people names — fetched once on mount.
  const loadBaseData = useCallback(async () => {
    const [attendance, people] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('attendance_records')
          .select('person_id, date, meeting_id, person:people(full_name)')
          .order('id', { ascending: true })
          .range(from, to)
      ),
      supabase.from('people').select('id, full_name'),
    ]);

    setAttendanceRows(
      attendance.map(r => ({
        pid: r.person_id as string,
        name: ((r.person as Record<string, unknown>)?.full_name as string) || 'Unknown',
        date: r.date as string,
        meetingId: r.meeting_id as string,
      }))
    );

    const nameMap = new Map<string, string>();
    for (const p of (people.data as Array<{ id: string; full_name: string }>) ?? []) {
      nameMap.set(p.id, p.full_name);
    }
    setPeopleById(nameMap);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.all([loadBaseData(), loadFollowupTables()]);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadBaseData, loadFollowupTables]);

  // Live sync across committee members: reload only the small follow-up tables.
  useEffect(() => {
    const channel = supabase
      .channel('followup-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'followup_status' }, () => loadFollowupTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'followup_notes' }, () => loadFollowupTables())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'followup_members' }, () => loadFollowupTables())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFollowupTables]);

  const memberById = useMemo(() => {
    const m = new Map<string, string>();
    for (const member of members) m.set(member.id, member.name);
    return m;
  }, [members]);

  const notesByPerson = useMemo(() => {
    // notes are ordered created_at desc, so each person's array is newest-first.
    const m = new Map<string, FollowupNote[]>();
    for (const n of notes) {
      if (!m.has(n.person_id)) m.set(n.person_id, []);
      m.get(n.person_id)!.push(n);
    }
    return m;
  }, [notes]);

  // Watch list = inactive-by-cutoff ∪ manually-flagged, merged with follow-up state.
  const watchList = useMemo<WatchListEntry[]>(() => {
    const inactive = computeInactivePeople(attendanceRows, cutoffWeeks, '', 3);
    const inactiveById = new Map(inactive.map(p => [p.person_id, p]));

    // Per-person attendance aggregate (for flagged people not in the inactive set).
    const agg = new Map<string, string[]>();
    for (const r of attendanceRows) {
      if (!agg.has(r.pid)) agg.set(r.pid, []);
      agg.get(r.pid)!.push(r.date);
    }

    const statusById = new Map(statuses.map(s => [s.person_id, s]));
    const flaggedIds = statuses.filter(s => s.needs_followup).map(s => s.person_id);
    const ids = new Set<string>([...inactiveById.keys(), ...flaggedIds]);

    const today = new Date(getTodayDate() + 'T00:00:00').getTime();
    const entries: WatchListEntry[] = [];
    for (const pid of ids) {
      const inactiveRow = inactiveById.get(pid);
      const status = statusById.get(pid);
      const dates = agg.get(pid);

      let lastSeenDate: string | null = null;
      let totalAttendances = 0;
      if (dates && dates.length > 0) {
        const sorted = [...dates].sort();
        lastSeenDate = sorted[sorted.length - 1];
        totalAttendances = dates.length;
      }

      const weeksSinceLast = inactiveRow
        ? inactiveRow.weeksSinceLast
        : lastSeenDate
          ? Math.floor((today - new Date(lastSeenDate + 'T00:00:00').getTime()) / WEEK_MS)
          : 0;

      entries.push({
        person_id: pid,
        person_name: peopleById.get(pid) ?? inactiveRow?.person_name ?? 'Unknown',
        totalAttendances,
        lastSeenDate,
        weeksSinceLast,
        needs_followup: status?.needs_followup ?? false,
        assigned_to: status?.assigned_to ?? null,
        latestNotePreview: notesByPerson.get(pid)?.[0]?.body ?? null,
        isInactiveByCutoff: !!inactiveRow,
      });
    }
    return entries;
  }, [attendanceRows, statuses, cutoffWeeks, peopleById, notesByPerson]);

  // --- Mutations (upsert only the changed column; refetch the small tables) ---

  const toggleNeedsFollowup = useCallback(async (personId: string, value: boolean) => {
    await supabase
      .from('followup_status')
      .upsert({ person_id: personId, needs_followup: value, updated_at: new Date().toISOString() }, { onConflict: 'person_id' });
    await loadFollowupTables();
  }, [loadFollowupTables]);

  const setAssignee = useCallback(async (personId: string, memberId: string | null) => {
    await supabase
      .from('followup_status')
      .upsert({ person_id: personId, assigned_to: memberId, updated_at: new Date().toISOString() }, { onConflict: 'person_id' });
    await loadFollowupTables();
  }, [loadFollowupTables]);

  const addNote = useCallback(async (personId: string, authorId: string | null, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    await supabase.from('followup_notes').insert({ person_id: personId, author_id: authorId, body: trimmed });
    await loadFollowupTables();
  }, [loadFollowupTables]);

  const addMember = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from('followup_members').insert({ name: trimmed });
    await loadFollowupTables();
  }, [loadFollowupTables]);

  const removeMember = useCallback(async (id: string) => {
    await supabase.from('followup_members').delete().eq('id', id);
    await loadFollowupTables();
  }, [loadFollowupTables]);

  return {
    loading,
    watchList,
    members,
    memberById,
    notesByPerson,
    toggleNeedsFollowup,
    setAssignee,
    addNote,
    addMember,
    removeMember,
  };
}
