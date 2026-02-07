import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { SESSION_STORAGE_KEY, ACCESS_KEY_CONFIG_KEY } from '../lib/constants';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem(SESSION_STORAGE_KEY) === 'true'
  );

  const login = useCallback(async (key: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', ACCESS_KEY_CONFIG_KEY)
      .single();

    if (error || !data) return false;

    if (data.value === key) {
      localStorage.setItem(SESSION_STORAGE_KEY, 'true');
      setIsAuthenticated(true);
      return true;
    }

    return false;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, login, logout };
}
