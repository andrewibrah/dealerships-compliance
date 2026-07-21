import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Set once a password sign-in yields an AAL1 session with an enrolled factor:
  // the caller must present a TOTP code to reach AAL2 before we route onward.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  useEffect(() => {
    // Don't bounce to the dashboard while a sign-in is mid-flight or an MFA
    // step-up is pending — the AAL1 session isn't yet cleared to see data.
    if (!loading && isAuthenticated && !mfaFactorId && !submitting) {
      setLocation('/dashboard');
    }
  }, [isAuthenticated, loading, setLocation, mfaFactorId, submitting]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (totp) {
          setMfaCode('');
          setMfaFactorId(totp.id);
          return;
        }
      }
      setLocation('/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError('');
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: mfaCode.trim(),
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
          {mfaFactorId ? (
            <>
              <h1 className="mb-2 text-2xl font-bold text-white">Two-factor authentication</h1>
              <p className="mb-6 text-slate-400">
                Enter the 6-digit code from your authenticator app.
              </p>

              <form onSubmit={handleMfaVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mfa-code" className="text-slate-300">Verification code</Label>
                  <Input
                    id="mfa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="123456"
                    required
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                    className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                {error && (
                  <p id="login-error" role="alert" className="text-red-400 text-sm">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={submitting || mfaCode.trim().length === 0}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold py-6"
                >
                  {submitting ? 'Verifying...' : 'Verify'}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="mb-2 text-2xl font-bold text-white">Login</h1>
              <p className="mb-6 text-slate-400">Access your compliance dashboard</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                    className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    aria-invalid={!!error}
                    aria-describedby={error ? 'login-error' : undefined}
                    className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
                  />
                </div>

                {/* role="alert" carries an implicit aria-live="assertive"; the node is
                    conditionally mounted, so it announces on mount. */}
                {error && (
                  <p id="login-error" role="alert" className="text-red-400 text-sm">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold py-6"
                >
                  {submitting ? 'Signing in...' : 'Sign In'}
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
                Don't have an account?{' '}
                <button
                  onClick={() => setLocation('/signup')}
                  className="text-amber-500 hover:text-amber-400 font-semibold"
                >
                  Sign up here
                </button>
              </p>

              <p className="mt-6 text-center text-xs text-slate-500">
                By logging in, you agree to our Terms of Service and Privacy Policy
              </p>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
