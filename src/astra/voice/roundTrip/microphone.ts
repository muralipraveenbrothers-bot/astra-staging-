/** Shared microphone permission for Saarathi / Astra voice on every dashboard. */

export const SAARATHI_MIC_GRANTED_KEY = "astra.saarathi.micGranted";

export interface MicrophoneAccess {
  ok: boolean;
  granted: boolean;
  message?: string;
}

function rememberGranted(): void {
  try {
    localStorage.setItem(SAARATHI_MIC_GRANTED_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function wasMicrophoneGranted(): boolean {
  try {
    return localStorage.getItem(SAARATHI_MIC_GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function microphoneErrorMessage(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String((err as { name?: string }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone is blocked. Click the lock icon in the address bar → Site settings → Microphone → Allow, then press Speak.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Plug in a headset and press Speak again.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is in use by another app. Close it, then press Speak.";
  }
  const message = err instanceof Error ? err.message : String(err ?? "Access denied");
  return `Microphone error: ${message}`;
}

/** Ask the browser for the mic. Safe to call after the user has already clicked Allow. */
export async function ensureMicrophone(): Promise<MicrophoneAccess> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      granted: false,
      message: "This browser cannot open the microphone. Use Chrome or Edge on http://127.0.0.1:5173.",
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    rememberGranted();
    return { ok: true, granted: true };
  } catch (err) {
    return { ok: false, granted: false, message: microphoneErrorMessage(err) };
  }
}

export async function queryMicrophoneGranted(): Promise<boolean> {
  if (wasMicrophoneGranted()) return true;
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return false;
  try {
    const perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
    if (perm.state === "granted") {
      rememberGranted();
      return true;
    }
  } catch {
    /* Chromium on Windows sometimes has no microphone permission name */
  }
  return false;
}

/** Start listening as soon as the user (or address-bar Allow) grants the mic. */
export function watchMicrophonePermission(onGranted: () => void): () => void {
  let cancelled = false;
  let perm: PermissionStatus | null = null;
  const fire = () => {
    if (cancelled) return;
    rememberGranted();
    onGranted();
  };
  void (async () => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    try {
      perm = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (cancelled) return;
      if (perm.state === "granted") fire();
      perm.onchange = () => {
        if (perm?.state === "granted") fire();
      };
    } catch {
      /* query unsupported */
    }
  })();
  return () => {
    cancelled = true;
    if (perm) perm.onchange = null;
  };
}
