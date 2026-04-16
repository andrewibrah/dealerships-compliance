import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: "user" | "admin";
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();

  useEffect(() => {
    setLoading(isLoading);
    if (!isLoading) {
      setIsAuthenticated(!!user);
    }
  }, [user, isLoading]);

  const logout = async () => {
    await logoutMutation.mutateAsync();
    setIsAuthenticated(false);
    setLocation("/");
  };

  return {
    user: user as AuthUser | null,
    isAuthenticated,
    loading,
    logout,
  };
}
