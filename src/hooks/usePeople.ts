import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Person } from '../types';

export interface SearchResult {
  person: Person;
  alreadyMarked: boolean;
  notesMatch: boolean;
}

function scorePerson(person: Person, query: string): number {
  const name = person.full_name.toLowerCase();
  const q = query.toLowerCase();

  if (name === q) return 100;
  if (name.startsWith(q)) return 90;

  const words = name.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(q)) return 80;
  }

  if (name.includes(q)) return 70;

  if (person.notes?.toLowerCase().includes(q)) return 50;

  return 0;
}

export function usePeople() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const peopleRef = useRef<Person[]>([]);
  const attendanceCountsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    async function load() {
      const [{ data: peopleData }, { data: countData }] = await Promise.all([
        supabase.from('people').select('*').order('full_name'),
        supabase.from('attendance_records').select('person_id'),
      ]);

      if (peopleData) {
        setPeople(peopleData);
        peopleRef.current = peopleData;
      }

      if (countData) {
        const counts = new Map<string, number>();
        for (const row of countData) {
          counts.set(row.person_id, (counts.get(row.person_id) || 0) + 1);
        }
        attendanceCountsRef.current = counts;
      }

      setLoading(false);
    }

    load();
  }, []);

  const searchPeople = useCallback(
    (query: string, markedIds: Set<string>): SearchResult[] => {
      if (!query.trim()) return [];

      const q = query.trim();
      const results: { person: Person; score: number; alreadyMarked: boolean }[] = [];

      for (const person of peopleRef.current) {
        const score = scorePerson(person, q);
        if (score > 0) {
          results.push({
            person,
            score,
            alreadyMarked: markedIds.has(person.id),
            notesMatch: score <= 50,
          });
        }
      }

      results.sort((a, b) => {
        if (a.alreadyMarked !== b.alreadyMarked) {
          return a.alreadyMarked ? 1 : -1;
        }
        if (b.score !== a.score) return b.score - a.score;
        // Tiebreaker: higher attendance count first
        const aCount = attendanceCountsRef.current.get(a.person.id) || 0;
        const bCount = attendanceCountsRef.current.get(b.person.id) || 0;
        if (bCount !== aCount) return bCount - aCount;
        return a.person.full_name.localeCompare(b.person.full_name);
      });

      return results.slice(0, 20).map(({ person, alreadyMarked, notesMatch }) => ({
        person,
        alreadyMarked,
        notesMatch,
      }));
    },
    []
  );

  const isDuplicate = useCallback((name: string): boolean => {
    const normalized = name.trim().toLowerCase();
    return peopleRef.current.some(p => p.full_name.toLowerCase() === normalized);
  }, []);

  const addPerson = useCallback(
    async (fullName: string, notes?: string): Promise<Person | null> => {
      if (isDuplicate(fullName)) return null;

      const { data, error } = await supabase
        .from('people')
        .insert({
          full_name: fullName.trim(),
          notes: notes?.trim() || null,
        })
        .select()
        .single();

      if (error || !data) return null;

      setPeople(prev => {
        const updated = [...prev, data].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        );
        peopleRef.current = updated;
        return updated;
      });

      return data;
    },
    [isDuplicate]
  );

  return { people, loading, searchPeople, addPerson, isDuplicate };
}
