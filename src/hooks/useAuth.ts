import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  SESSION_STORAGE_KEY,
  ACCESS_KEY_CONFIG_KEY,
  FOLLOWUP_SESSION_STORAGE_KEY,
  FOLLOWUP_ACCESS_KEY_CONFIG_KEY,
  type AuthRole,
} from '../lib/constants';

// Each role authenticates independently: its own localStorage flag + its own
// app_config password row. The 'attendance' role keeps the original keys so
// existing logged-in sessions survive this change untouched.
const ROLE_CONFIG: Record<AuthRole, { storageKey: string; configKey: string }> = {
  attendance: { storageKey: SESSION_STORAGE_KEY, configKey: ACCESS_KEY_CONFIG_KEY },
  followup: { storageKey: FOLLOWUP_SESSION_STORAGE_KEY, configKey: FOLLOWUP_ACCESS_KEY_CONFIG_KEY },
};

export function useAuth(role: AuthRole = 'attendance') {
  const { storageKey, configKey } = ROLE_CONFIG[role];

  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem(storageKey) === 'true'
  );

  const login = useCallback(async (key: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', configKey)
      .single();

    // If the password row doesn't exist yet (e.g. followup_access_key not
    // inserted), .single() errors — treat as a failed login, never crash.
    if (error || !data) return false;

    if (data.value === key) {
      localStorage.setItem(storageKey, 'true');
      setIsAuthenticated(true);
      return true;
    }

    return false;
  }, [storageKey, configKey]);

  const logout = useCallback(() => {
    localStorage.removeItem(storageKey);
    setIsAuthenticated(false);
  }, [storageKey]);

  return { isAuthenticated, login, logout };
}
