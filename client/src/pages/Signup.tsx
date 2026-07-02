import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

const getEmailRedirectTo = () => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_APP_URL || undefined;
  }

  const basePath = import.meta.env.BASE_URL || '/';
  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return new URL(normalizedBasePath, window.location.origin).toString();
};

export default function Signup() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation('/dashboard');
    }
  }, [isAuthenticated, loading, setLocation]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: getEmailRedirectTo(),
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setLocation('/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <div className="p-8">
          <h1 className="mb-2 text-2xl font-bold text-white">Create Account</h1>
          <p className="mb-6 text-slate-400">Start your compliance journey with dealerships</p>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-slate-300">
                Name <span className="text-slate-500">(optional)</span>
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                minLength={8}
                className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-6"
            >
              {submitting ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          <div className="mt-4 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800 text-slate-400">or</span>
            </div>
          </div>

          <p className="mt-4 text-center text-slate-300 text-sm">
            Already have an account?{' '}
            <button
              onClick={() => setLocation('/login')}
              className="text-amber-500 hover:text-amber-400 font-semibold"
            >
              Login here
            </button>
          </p>

          <div className="mt-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
            <h3 className="font-semibold text-white mb-2 text-sm">What you'll get:</h3>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Free 9-section compliance assessment
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Real-time compliance scoring
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Gap analysis and recommendations
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">✓</span>
                Optional upgrade to Core plan ($200/month)
              </li>
            </ul>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </Card>
    </div>
  );
}
