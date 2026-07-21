import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/**
 * TOTP factor enrollment for the Qualified Individual (PRD #47). Lets a user add
 * an authenticator app, verify it, and see it reflected here; removal is offered
 * for a verified factor. Login step-up (AAL1 -> AAL2) lives in the Login page;
 * server-side AAL2 enforcement lives in the tRPC procedure tiers.
 */
type EnrollState =
  | { step: "loading" }
  | { step: "status"; enrolled: boolean }
  | { step: "enrolling"; factorId: string; qrCode: string; secret: string };

export function MfaEnrollment() {
  const [state, setState] = useState<EnrollState>({ step: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(error.message);
      setState({ step: "status", enrolled: false });
      return;
    }
    setState({ step: "status", enrolled: (data?.totp?.length ?? 0) > 0 });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) {
        toast.error(error?.message ?? "Could not start enrollment.");
        return;
      }
      setCode("");
      setState({ step: "enrolling", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    } finally {
      setBusy(false);
    }
  };

  const verifyEnroll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state.step !== "enrolling") return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: state.factorId,
        code: code.trim(),
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Authenticator enrolled. You'll be asked for a code at your next sign-in.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (state.step !== "enrolling") return;
    // Drop the unverified factor so a retry starts clean.
    await supabase.auth.mfa.unenroll({ factorId: state.factorId });
    await refresh();
  };

  const removeFactor = async () => {
    setBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp?.[0];
      if (!factor) {
        await refresh();
        return;
      }
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Authenticator removed.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="mfa-heading" className="rounded-lg border border-slate-700 bg-slate-900/40 p-6">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="text-amber-500" size={20} aria-hidden="true" />
        <h2 id="mfa-heading" className="text-lg font-semibold text-white">
          Two-factor authentication
        </h2>
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Protect your compliance program with a time-based one-time passcode (TOTP) from an
        authenticator app such as Google Authenticator, 1Password, or Authy.
      </p>

      {state.step === "loading" && (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="animate-spin" size={18} aria-hidden="true" />
          <span>Checking status…</span>
        </div>
      )}

      {state.step === "status" && state.enrolled && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck size={18} aria-hidden="true" />
            Authenticator enrolled — a code is required at sign-in.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={removeFactor}
          >
            {busy ? "Removing…" : "Remove authenticator"}
          </Button>
        </div>
      )}

      {state.step === "status" && !state.enrolled && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-amber-400">
            <ShieldAlert size={18} aria-hidden="true" />
            No authenticator enrolled.
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={startEnroll}
            className="bg-amber-600 hover:bg-amber-500 text-slate-950"
          >
            {busy ? "Starting…" : "Enroll authenticator"}
          </Button>
        </div>
      )}

      {state.step === "enrolling" && (
        <form onSubmit={verifyEnroll} className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>Scan this QR code with your authenticator app.</li>
            <li>Enter the 6-digit code it shows to confirm.</li>
          </ol>

          <img
            src={state.qrCode}
            alt="QR code to add this account to your authenticator app"
            className="h-44 w-44 rounded bg-white p-2"
          />

          <div className="space-y-1">
            <Label htmlFor="mfa-secret" className="text-slate-300">
              Or enter this setup key manually
            </Label>
            <Input
              id="mfa-secret"
              readOnly
              value={state.secret}
              className="bg-slate-900 border-slate-600 font-mono text-white"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="mfa-enroll-code" className="text-slate-300">
              Verification code
            </Label>
            <Input
              id="mfa-enroll-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              required
              className="bg-slate-900 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={cancelEnroll}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || code.trim().length === 0}
              className="bg-amber-600 hover:bg-amber-500 text-slate-950"
            >
              {busy ? "Verifying…" : "Verify & enable"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
