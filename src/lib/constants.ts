export const SESSION_STORAGE_KEY = 'aebc-authenticated';
export const ACCESS_KEY_CONFIG_KEY = 'access_key';

// Follow-up dashboard is a separately-passworded section (its own role/session).
export const FOLLOWUP_SESSION_STORAGE_KEY = 'aebc-followup-authenticated';
export const FOLLOWUP_ACCESS_KEY_CONFIG_KEY = 'followup_access_key';

export type AuthRole = 'attendance' | 'followup';
