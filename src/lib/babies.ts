// Hardcoded list of people treated as babies (👶). Matched by exact full name.
// Edit this list to add/remove babies — no database involved.
export const BABIES: string[] = [
  'William Sarnouk',
  'Ella Alabras',
  'Alba Martins',
  'Ella Jaine Pullan',
];

export function isBaby(fullName: string | undefined | null): boolean {
  return !!fullName && BABIES.includes(fullName);
}
