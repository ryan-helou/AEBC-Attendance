import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetch every matching row, paging past PostgREST's default 1000-row response cap.
 *
 * Supabase silently truncates query results at 1000 rows, which corrupts any
 * client-side aggregation over a large table (wrong counts, missing people,
 * incomplete exports). Pass a factory that applies `.range(from, to)` to a
 * freshly-built query each call; it MUST also include a deterministic
 * `.order(...)` (e.g. by `id`) so pages don't overlap or skip rows.
 *
 * Example:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from('attendance_records')
 *       .select('person_id, date')
 *       .order('id', { ascending: true })
 *       .range(from, to)
 *   );
 */
export async function fetchAllRows(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  pageSize = 1000,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error || !Array.isArray(data)) break;
    all.push(...(data as Array<Record<string, unknown>>));
    if (data.length < pageSize) break;
  }
  return all;
}
