// Astra-styled login gate — pick a staff account, enter its PIN.
// Session persists in localStorage; logging out returns here.

import { useState } from "react";
import { ArrowLeft, KeyRound, Lock, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AvatarOrb } from "@/components/AvatarOrb";
import { ROLE_LABEL, STAGING_DEMO_AUTH, useAuth, type Account } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function Login({ onBack }: { onBack?: () => void }) {
  const { login, requiredRole, accounts, authServerReachable } = useAuth();
  const [picked, setPicked] = useState<Account | null>(null);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  const tryLogin = async (acc: Account, p: string) => {
    const result = await login(acc.id, p);
    if (result.ok) {
      // A forced mustChangePin account lands on the change-PIN screen via the
      // app shell gate before anything else renders.
      toast.success(`Welcome, ${acc.name}`, { description: `${ROLE_LABEL[acc.role]} workspace loading…` });
    } else {
      setShake(true);
      setPin("");
      setTimeout(() => setShake(false), 500);
      toast.error(result.message ?? "Wrong PIN", { description: result.message ? undefined : "Check the PIN for this account and try again." });
    }
  };

  const visibleAccounts = requiredRole ? accounts.filter((account) => account.role === requiredRole) : accounts;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-2xl">
        {/* brand */}
        <div className="flex flex-col items-center mb-8">
          <AvatarOrb size={84} />
          <h1 className="font-display text-4xl font-bold text-gradient mt-4 tracking-wide">Astra AI</h1>
          <p className="text-[11px] uppercase tracking-[0.3em] text-yellow-500/80 mt-1">PM Brothers Multispeciality Hospital · HMS Sign-in</p>
          {STAGING_DEMO_AUTH && (
            <p className="mt-3 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
              Staging demo — no API or patient data
            </p>
          )}
          {!STAGING_DEMO_AUTH && !authServerReachable && (
            <p className="mt-3 rounded-full border border-red-400/40 bg-red-400/10 px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-red-200">
              Astra server not reachable on port 3000. Start the Astra API before signing in.
            </p>
          )}
        </div>

        <div className={cn("glass p-6", shake && "animate-pulse")}>
          {!picked ? (
            <>
              <p className="text-sm text-slate-300 text-center mb-4 flex items-center justify-center gap-2">
                <ShieldCheck size={15} className="text-yellow-400" /> Select your staff account
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {visibleAccounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setPicked(a); setPin(""); }}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-left hover:border-yellow-400/50 hover:bg-yellow-400/[0.05] transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-500/25 to-violet-500/25 border border-violet-400/30 flex items-center justify-center text-sm font-bold text-white group-hover:border-yellow-400/50">
                        {a.name.replace("Dr. ", "").slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{a.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{a.subtitle}</p>
                      </div>
                      <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-yellow-500/80 border border-yellow-500/30 rounded-full px-2 py-0.5 shrink-0">
                        {ROLE_LABEL[a.role].split(" ")[0]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 text-center mt-4">
                {requiredRole ? `This link is restricted to the ${ROLE_LABEL[requiredRole]} workspace.` : "Staff modules run fully offline — the AI layer unlocks for Doctor & CEO roles."}
              </p>
              {onBack && (
                <button onClick={onBack} className="mt-4 text-[11px] text-slate-500 hover:text-violet-300 flex items-center gap-1.5 mx-auto transition-colors">
                  <ArrowLeft size={12} /> Back to home
                </button>
              )}
            </>
          ) : (
            <div className="max-w-xs mx-auto text-center">
              <div className="h-14 w-14 mx-auto rounded-full bg-gradient-to-br from-cyan-500/25 to-violet-500/25 border border-yellow-400/40 flex items-center justify-center text-xl font-bold text-white">
                {picked.name.replace("Dr. ", "").slice(0, 1)}
              </div>
              <p className="text-base font-semibold text-white mt-3">{picked.name}</p>
              <p className="text-[11px] text-slate-500">{picked.subtitle}</p>
              {STAGING_DEMO_AUTH && picked.id === "reception" && (
                <p className="text-[10px] text-cyan-300 mt-2">Login ID: <b>9492397291</b></p>
              )}

              <div className="relative mt-5">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  className="input-dark !pl-9 text-center !text-lg tracking-[0.5em] font-mono"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setPin(v);
                    // Auto-submit only at 6 — 4-digit PINs submit via Enter or
                    // the button, and 6-digit PINs would break on auto-submit at 4.
                    if (v.length === 6) void tryLogin(picked, v);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter" && pin) void tryLogin(picked, pin); }}
                />
              </div>
              <p className="text-[10px] text-slate-600 mt-2 flex items-center justify-center gap-1">
                <KeyRound size={10} /> {STAGING_DEMO_AUTH ? "Enter the staging demo PIN." : "Enter the PIN assigned by your administrator."}
              </p>
              <div className="flex gap-2 mt-5">
                <button className="btn-ghost !text-xs flex-1" onClick={() => { setPicked(null); setPin(""); }}>← Back</button>
                <button className="btn-neon !text-xs flex-1" disabled={!pin} onClick={() => void tryLogin(picked, pin)}>Sign in</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Forced first-login PIN upgrade. Rendered before anything else when the
 *  signed-in account still carries mustChangePin from the server vault. */
export function MustChangePin() {
  const { account, changePin, logout } = useAuth();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = /^\d{6,}$/.test(pin) && pin === confirm;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await changePin(pin);
    setBusy(false);
    if (ok) {
      toast.success("New PIN saved", { description: "Use it for future sign-ins on any device." });
      setPin(""); setConfirm("");
    } else {
      toast.error("Could not change the PIN", { description: "Use at least 6 digits and make both fields match." });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <AvatarOrb size={72} />
          <h1 className="font-display text-3xl font-bold text-gradient mt-4 tracking-wide">Set a new PIN</h1>
          <p className="text-[11px] uppercase tracking-[0.3em] text-yellow-500/80 mt-1">Security upgrade required</p>
        </div>
        <div className="glass p-6">
          <p className="text-xs text-amber-300 flex items-start gap-2 mb-4">
            <ShieldAlert size={15} className="shrink-0 mt-0.5" />
            Your account uses a temporary starter PIN. Choose a new PIN of at least 6 digits before continuing — it replaces the starter PIN on every device.
          </p>
          <p className="text-sm font-semibold text-white mb-3">{account?.name ?? "Staff account"}</p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            maxLength={12}
            className="input-dark text-center !text-lg tracking-[0.4em] font-mono"
            placeholder="New PIN (min 6 digits)"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={12}
            className="input-dark text-center !text-lg tracking-[0.4em] font-mono mt-3"
            placeholder="Repeat new PIN"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
          />
          <p className="text-[10px] text-slate-600 mt-2 flex items-center justify-center gap-1">
            <KeyRound size={10} /> Minimum 6 digits. Only a salted scrypt hash is stored server-side.
          </p>
          <div className="flex gap-2 mt-5">
            <button className="btn-ghost !text-xs flex-1" onClick={logout}>Sign out</button>
            <button className="btn-neon !text-xs flex-1" disabled={!valid || busy} onClick={() => void submit()}>
              {busy ? "Saving…" : "Save and continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
