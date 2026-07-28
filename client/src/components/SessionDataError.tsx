import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Shown when the caller IS signed in (a valid Supabase session exists) but the backend
 * failed to return their account — e.g. a 500 from the database layer.
 *
 * This exists to keep a *data* failure from being handled as an *auth* failure: the
 * pages previously redirected to /login whenever `user` was null, which is also what a
 * failed `auth.me` looks like, so a transient backend error ejected a signed-in user.
 * The session is untouched here; the caller can simply retry.
 */
export function SessionDataError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <AlertTriangle className="text-amber-500 mx-auto mb-4" size={40} aria-hidden="true" />
        <h1 className="text-xl font-semibold text-white mb-2">We couldn't load your account</h1>
        <p className="text-slate-300 mb-6">
          You're still signed in — this is a problem on our side, not with your session.
          Please try again in a moment.
        </p>
        <Button onClick={onRetry} className="bg-amber-600 hover:bg-amber-500 text-slate-950">
          Try again
        </Button>
      </div>
    </div>
  );
}
