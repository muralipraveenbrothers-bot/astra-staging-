// ASTRA SAARATHI — React binding for the Holo gesture bridge.
//
// The bridge is only ever started when the SERVER says gesture mode is enabled
// (`/api/saarathi/health` → components.gestureBridge === "ENABLED"). That keeps
// the deliberate policy gate — "Gesture mode is intentionally off until voice
// acceptance passes" — as the single source of truth. Flipping
// `ASTRA_SAARATHI_GESTURES=true` turns this on with no client change; leaving it
// false keeps the bridge inert and the UI honest about why.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createKeyboardGestureSource,
  HoloGestureBridge,
  type HoloBridgeEvent,
  type HoloBridgeStatus,
  type HoloGestureTarget,
  type HoloGestureSource,
  type HoloMappedAction,
} from "./HoloGestureBridge";
import type { HoloGestureEvent } from "./GesturePolicy";

const HEALTH_ENDPOINT = "/api/saarathi/health";

export interface HoloGesturesState {
  /** "disabled" means the server gate is closed — not a failure. */
  status: HoloBridgeStatus;
  listening: boolean;
  lastGesture?: HoloGestureEvent;
  lastAction?: HoloMappedAction;
  /** Honest failure/gate text. Surfaces must render this. */
  error?: string;
  submit: (gesture: HoloGestureEvent, targetId?: string) => Promise<void>;
}

export function useHoloGestures(opts: {
  token?: string | null;
  /** Default target for gestures that carry no explicit targetId. */
  targetId?: string;
  /** Optional UI surface to receive mapped actions. */
  target?: HoloGestureTarget;
  /** Override the input source. Defaults to the keyboard source. */
  source?: HoloGestureSource;
  /** How often to re-check the server's gesture gate. */
  healthPollMs?: number;
}): HoloGesturesState {
  const { token, targetId, target, source, healthPollMs = 20000 } = opts;

  const bridge = useMemo(() => new HoloGestureBridge(), []);
  const [status, setStatus] = useState<HoloBridgeStatus>("idle");
  const [listening, setListening] = useState(false);
  const [last, setLast] = useState<HoloBridgeEvent | undefined>();

  // Keep the latest target id without restarting the source on every render.
  const targetIdRef = useRef<string | undefined>(targetId);
  targetIdRef.current = targetId;

  // Register the UI target.
  useEffect(() => {
    if (!target) return;
    return bridge.register(target);
  }, [bridge, target]);

  // Mirror bridge events into React state.
  useEffect(
    () =>
      bridge.subscribe((event) => {
        setLast(event);
        if (event.status === "disabled" || event.status === "error") {
          setStatus(event.status);
        } else if (bridge.listening) {
          setStatus("active");
        }
      }),
    [bridge]
  );

  // Gate on the server's policy, then start/stop the source accordingly.
  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | null = null;

    const check = async () => {
      try {
        const res = await fetch(HEALTH_ENDPOINT, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setLast({ gesture: "select", status: "error", error: `Saarathi health HTTP ${res.status}` });
          return;
        }
        const body = (await res.json()) as { components?: { gestureBridge?: string } };
        const enabled = body.components?.gestureBridge === "ENABLED";
        if (cancelled) return;

        if (!enabled) {
          detach?.();
          detach = null;
          setListening(false);
          setStatus("disabled");
          setLast({
            gesture: "select",
            status: "disabled",
            error: "Gesture mode is intentionally off until voice acceptance passes.",
          });
          return;
        }

        if (detach) return; // already listening
        const inputSource =
          source ?? createKeyboardGestureSource(() => targetIdRef.current);
        detach = bridge.start(inputSource, token);
        setListening(true);
        setStatus("active");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setLast({
          gesture: "select",
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void check();
    const timer = setInterval(() => void check(), healthPollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
      detach?.();
      bridge.stop();
      setListening(false);
    };
  }, [bridge, token, source, healthPollMs]);

  const submit = useCallback(
    async (gesture: HoloGestureEvent, explicitTargetId?: string) => {
      await bridge.submit(gesture, explicitTargetId ?? targetIdRef.current, token);
    },
    [bridge, token]
  );

  return {
    status,
    listening,
    lastGesture: last?.gesture,
    lastAction: last?.action,
    error: last?.status === "active" ? undefined : last?.error,
    submit,
  };
}
