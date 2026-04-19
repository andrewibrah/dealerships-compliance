import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { trpc } from '@/lib/trpc';
import { useLocation } from 'wouter';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
}

export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { data: user, isLoading: userLoading } = trpc.auth.me.useQuery(undefined, {
    enabled: !!session,
  });

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setLocation('/');
  }, [setLocation]);

  return {
    user: (user as AuthUser | null | undefined) ?? null,
    session,
    isAuthenticated: !!session,
    loading: loading || userLoading,
    logout,
  };
}
