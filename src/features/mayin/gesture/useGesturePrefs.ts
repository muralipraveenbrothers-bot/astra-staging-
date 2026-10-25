import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_GESTURE_SENSITIVITY,
  type ViewerGestureSensitivity,
} from "./ViewerGestureProcessor";

export const GESTURE_ENABLED_PREF_KEY = "astra.gesture.enabled";
export const GESTURE_SENSITIVITY_PREF_KEY = "astra.gesture.sensitivity";
const GESTURE_PREFS_EVENT = "astra-gesture-prefs-changed";

export interface GesturePrefs {
  gestureEnabled: boolean;
  setGestureEnabled: (enabled: boolean) => void;
  sensitivity: ViewerGestureSensitivity;
  setSensitivity: (patch: Partial<ViewerGestureSensitivity>) => void;
}

function readGestureEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(GESTURE_ENABLED_PREF_KEY) === "on";
}

function readSensitivity(): ViewerGestureSensitivity {
  if (typeof window === "undefined") return DEFAULT_GESTURE_SENSITIVITY;
  try {
    const raw = window.localStorage.getItem(GESTURE_SENSITIVITY_PREF_KEY);
    if (!raw) return DEFAULT_GESTURE_SENSITIVITY;
    const parsed = JSON.parse(raw) as Partial<ViewerGestureSensitivity>;
    return { ...DEFAULT_GESTURE_SENSITIVITY, ...parsed };
  } catch {
    return DEFAULT_GESTURE_SENSITIVITY;
  }
}

export function useGesturePrefs(): GesturePrefs {
  const [gestureEnabled, setGestureEnabledState] = useState(readGestureEnabled);
  const [sensitivity, setSensitivityState] = useState(readSensitivity);

  const setGestureEnabled = useCallback((enabled: boolean) => {
    setGestureEnabledState(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GESTURE_ENABLED_PREF_KEY, enabled ? "on" : "off");
      window.dispatchEvent(
        new CustomEvent(GESTURE_PREFS_EVENT, { detail: { gestureEnabled: enabled } }),
      );
    }
  }, []);

  const setSensitivity = useCallback((patch: Partial<ViewerGestureSensitivity>) => {
    setSensitivityState((prev) => {
      const next = { ...prev, ...patch };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(GESTURE_SENSITIVITY_PREF_KEY, JSON.stringify(next));
        window.dispatchEvent(
          new CustomEvent(GESTURE_PREFS_EVENT, { detail: { sensitivity: next } }),
        );
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === GESTURE_ENABLED_PREF_KEY) {
        setGestureEnabledState(event.newValue === "on");
      }
      if (event.key === GESTURE_SENSITIVITY_PREF_KEY) setSensitivityState(readSensitivity());
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{
        gestureEnabled?: boolean;
        sensitivity?: ViewerGestureSensitivity;
      }>).detail;
      if (typeof detail?.gestureEnabled === "boolean") {
        setGestureEnabledState(detail.gestureEnabled);
      }
      if (detail?.sensitivity) setSensitivityState(detail.sensitivity);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(GESTURE_PREFS_EVENT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(GESTURE_PREFS_EVENT, onCustom);
    };
  }, []);

  return { gestureEnabled, setGestureEnabled, sensitivity, setSensitivity };
}
