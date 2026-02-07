import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Person } from '../types';

export interface SearchResult {
  person: Person;
  alreadyMarked: boolean;
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

  return 0;
}

export function usePeople() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const peopleRef = useRef<Person[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('people')
        .select('*')
        .order('full_name');

      if (data) {
        setPeople(data);
        peopleRef.current = data;
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
          });
        }
      }

      results.sort((a, b) => {
        if (a.alreadyMarked !== b.alreadyMarked) {
          return a.alreadyMarked ? 1 : -1;
        }
        if (b.score !== a.score) return b.score - a.score;
        return a.person.full_name.localeCompare(b.person.full_name);
      });

      return results.slice(0, 20).map(({ person, alreadyMarked }) => ({
        person,
        alreadyMarked,
      }));
    },
    []
  );

  const addPerson = useCallback(
    async (fullName: string, phone?: string, notes?: string): Promise<Person | null> => {
      const { data, error } = await supabase
        .from('people')
        .insert({
          full_name: fullName.trim(),
          phone: phone?.trim() || null,
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
    []
  );

  return { people, loading, searchPeople, addPerson };
}
