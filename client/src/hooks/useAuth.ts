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

  const logoutMutation = trpc.auth.logout.useMutation();

  const logout = useCallback(async () => {
    // Record the logout server-side (audit trail, PRD #34) while the session token is
    // still valid, then tear down the session. Best-effort: never block sign-out on it.
    await logoutMutation.mutateAsync().catch(() => {});
    await supabase.auth.signOut();
    setSession(null);
    setLocation('/');
  }, [logoutMutation, setLocation]);

  return {
    user: (user as AuthUser | null | undefined) ?? null,
    session,
    isAuthenticated: !!session,
    loading: loading || userLoading,
    logout,
  };
}
