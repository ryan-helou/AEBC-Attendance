import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Person, Gender } from '../types';

export interface SearchResult {
  person: Person;
  alreadyMarked: boolean;
  notesMatch: boolean;
}

// Search aliases: maps keywords to person names they should match
const SEARCH_ALIASES: Record<string, string[]> = {
  'phil wickham': ['jona safadi'],
  'phil': ['jona safadi'],
  'wickham': ['jona safadi'],
};

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function fuzzyScore(name: string, query: string): number {
  const words = name.split(/\s+/);
  let best = Infinity;
  for (const word of words) {
    // Compare against word prefix of same length as query
    const prefix = word.substring(0, query.length);
    best = Math.min(best, levenshtein(prefix, query));
    // Also check full word if query is longer
    if (query.length >= word.length) {
      best = Math.min(best, levenshtein(word, query));
    }
  }
  // Allow 1 typo for queries 3-5 chars, 2 typos for 6+
  const maxDist = query.length >= 6 ? 2 : query.length >= 3 ? 1 : 0;
  if (best <= maxDist && best > 0) return 40 - best * 5;
  return 0;
}

function aliasScore(person: Person, query: string): number {
  const q = query.toLowerCase();
  const name = person.full_name.toLowerCase();

  for (const [keyword, targets] of Object.entries(SEARCH_ALIASES)) {
    if (keyword.startsWith(q) || q.startsWith(keyword)) {
      if (targets.some(t => name.includes(t))) return 85;
    }
  }
  return 0;
}

function scorePerson(person: Person, query: string): number {
  const name = person.full_name.toLowerCase();
  const q = query.toLowerCase();

  if (name === q) return 100;
  if (name.startsWith(q)) return 90;

  const alias = aliasScore(person, q);
  if (alias > 0) return alias;

  const words = name.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(q)) return 80;
  }

  if (name.includes(q)) return 70;

  if (person.notes?.toLowerCase().includes(q)) return 50;

  const fuzzy = fuzzyScore(name, q);
  if (fuzzy > 0) return fuzzy;

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
      const results: { person: Person; score: number; alreadyMarked: boolean; notesMatch: boolean }[] = [];

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

  const isDuplicate = useCallback((name: string, notes?: string): boolean => {
    const normalized = name.trim().toLowerCase();
    const normalizedNotes = notes?.trim().toLowerCase() || '';
    return peopleRef.current.some(
      p => p.full_name.toLowerCase() === normalized &&
           (p.notes?.toLowerCase() || '') === normalizedNotes
    );
  }, []);

  const addPerson = useCallback(
    async (fullName: string, notes?: string, gender?: Gender | null): Promise<Person | null> => {
      if (isDuplicate(fullName, notes)) return null;

      const { data, error } = await supabase
        .from('people')
        .insert({
          full_name: fullName.trim(),
          notes: notes?.trim() || null,
          gender: gender ?? null,
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
