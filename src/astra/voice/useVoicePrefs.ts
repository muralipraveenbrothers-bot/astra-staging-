import { useCallback, useEffect, useState } from "react";

export const WAKE_WORD_PREF_KEY = "astra.voice.wakeWord";

export interface VoicePrefs {
  wakeWordEnabled: boolean;
  setWakeWordEnabled: (enabled: boolean) => void;
}

export function isWakeWordEnabled(stored: string | null): boolean {
  return stored === "on";
}

export function wakeWordStoredValue(enabled: boolean): "on" | "off" {
  return enabled ? "on" : "off";
}

function readWakeWordPref(): boolean {
  if (typeof window === "undefined") return false;
  return isWakeWordEnabled(window.localStorage.getItem(WAKE_WORD_PREF_KEY));
}

export function useVoicePrefs(): VoicePrefs {
  const [wakeWordEnabled, setWakeWordEnabledState] = useState(readWakeWordPref);

  const setWakeWordEnabled = useCallback((enabled: boolean) => {
    setWakeWordEnabledState(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WAKE_WORD_PREF_KEY, wakeWordStoredValue(enabled));
      window.dispatchEvent(new CustomEvent("astra-voice-prefs-changed", { detail: { wakeWordEnabled: enabled } }));
    }
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === WAKE_WORD_PREF_KEY) setWakeWordEnabledState(event.newValue === "on");
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ wakeWordEnabled?: boolean }>).detail;
      if (typeof detail?.wakeWordEnabled === "boolean") setWakeWordEnabledState(detail.wakeWordEnabled);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("astra-voice-prefs-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("astra-voice-prefs-changed", onCustom);
    };
  }, []);

  return { wakeWordEnabled, setWakeWordEnabled };
}
