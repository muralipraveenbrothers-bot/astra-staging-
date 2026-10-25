/**
 * ASTRA SAARATHI — STT priority router (repair prompt §D).
 * =======================================================
 *   MANDATORY ORDER
 *   1. VOICEBOX WHISPER (local)   ← primary ear
 *   2. BROWSER SPEECH RECOGNITION ← emergency ear, LABELLED as FALLBACK
 *
 * The main hands-free conversation path used to be a plain browser
 * `SpeechRecognition` hard-coded to `en-US`, while a local Whisper transcriber
 * existed but was unused. That is why Telugu/Hindi/Tenglish/Hinglish speakers were
 * misrecognised and why transcript quality did not match the voice runtime.
 *
 * This module records REAL audio and sends it to the local runtime. No cloud STT
 * is used anywhere, and raw microphone audio is never stored.
 */

import { ensureMicrophone, microphoneErrorMessage } from "@/astra/voice/roundTrip/microphone";
import { voiceSession } from "@/astra/voice/safety/voiceSession";
import type { SttAttempt, SttProviderId, SttResult } from "./voiceContracts";
import { getVoiceboxStatus, voiceboxTranscribe } from "./voiceboxLocal";
import { browserListenOnce, browserSttAvailable, fallbackLanguageTag } from "./browserVoice";

export type ListeningState =
  | "IDLE"
  | "REQUESTING_PERMISSION"
  | "LISTENING"
  | "TRANSCRIBING"
  | "FALLBACK"
  | "ERROR";

export interface ListenSaarathiOptions {
  /** BCP-47 tag, or "auto" to let local Whisper detect the language. */
  preferredLanguage?: string;
  /** Hard stop for a single utterance (default 15 s). */
  maxDurationMs?: number;
  /** Auto-stop after this much trailing silence (default 1.4 s). */
  silenceStopMs?: number;
  /** RMS threshold (0..1) below which a frame counts as silence. */
  silenceThreshold?: number;
  /**
   * Browser speech recognition is off. The voice agent must not use it.
   * A caller can still opt in for a labelled emergency ear.
   */
  allowBrowserFallback?: boolean;
  signal?: AbortSignal;
  /** Session-owned follow-up. Callers leave this unset. */
  allowDuringSpeech?: boolean;
  /** True when the doctor pressed Start / the mic. Wake-word ears are not manual. */
  manual?: boolean;
  onStateChange?: (state: ListeningState) => void;
  /** Live level (0..1) so the UI can show a real input meter. */
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
}

/** Providers used by the most recent turn — feeds the status HUD. */
export const lastSttProvider: { value?: SttProviderId } = {};

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function mergeFloat32(chunks: Float32Array[]): Float32Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((type) => {
    try { return MediaRecorder.isTypeSupported(type); } catch { return false; }
  });
}

/**
 * Start listening. Returns a handle so the UI (or barge-in) can stop early.
 * The promise ALWAYS resolves with a structured result — it never throws.
 */
function suppressedStt(): SttResult {
  return { ok: false, provider: "voicebox-whisper", text: "", error: "suppressed", latencyMs: 0, attempts: [] };
}

export function startSaarathiListening(options: ListenSaarathiOptions = {}): {
  promise: Promise<SttResult>;
  stop: () => void;
} {
  if (!options.allowDuringSpeech) {
    if (voiceSession.blocksNewEar(Boolean(options.manual))) {
      return { promise: Promise.resolve(suppressedStt()), stop: () => undefined };
    }
    if (voiceSession.earBlocked()) {
      let innerStop: (() => void) | null = null;
      let cancelled = false;
      const epoch = voiceSession.epoch();
      const promise = voiceSession.waitUntilQuiet().then(() => {
        if (
          cancelled
          || epoch !== voiceSession.epoch()
          || voiceSession.blocksNewEar(Boolean(options.manual))
          || voiceSession.earBlocked()
        ) {
          return suppressedStt();
        }
        const inner = startSaarathiListening({ ...options, allowDuringSpeech: true });
        innerStop = inner.stop;
        return inner.promise;
      });
      return {
        promise,
        stop: () => {
          cancelled = true;
          innerStop?.();
        },
      };
    }
  }

  const {
    preferredLanguage = "auto",
    maxDurationMs = 15_000,
    silenceStopMs = 1400,
    silenceThreshold = 0.012,
    signal,
  } = options;

  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let rafId = 0;
  let stopped = false;
  let stopRequested: (() => void) | null = null;
  let stopFn: () => void = () => undefined;

  const openedEpoch = voiceSession.epoch();
  const setState = (state: ListeningState) => {
    options.onStateChange?.(state);
    if (state === "LISTENING" && openedEpoch === voiceSession.epoch()) voiceSession.markListening();
  };

  const cleanup = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    try { if (recorder && recorder.state !== "inactive") recorder.stop(); } catch { /* noop */ }
    recorder = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    audioContext = null;
  };
  const promise = (async (): Promise<SttResult> => {
    const t0 = Date.now();
    const attempts: SttAttempt[] = [];

    /** Emergency ear. Off unless a caller explicitly opts in. Never the voice agent's mouth or ear. */
    const fallback = async (reason: string): Promise<SttResult> => {
      attempts.push({ provider: "voicebox-whisper", ok: false, latencyMs: Date.now() - t0, error: reason });
      if (!options.allowBrowserFallback) {
        setState("ERROR");
        options.onError?.(reason);
        return {
          ok: false,
          provider: "voicebox-whisper",
          text: "",
          error: reason,
          latencyMs: Date.now() - t0,
          attempts,
        };
      }
      if (!browserSttAvailable()) {
        setState("ERROR");
        const message =
          "No speech recognition is available: the local Whisper runtime is unreachable and this browser exposes no fallback recogniser.";
        options.onError?.(message);
        return { ok: false, provider: "browser-fallback", text: "", error: message, latencyMs: Date.now() - t0, attempts };
      }
      setState("FALLBACK");
      const fbT0 = Date.now();
      const { promise: recognised } = browserListenOnce({
        preferredLanguage: fallbackLanguageTag(preferredLanguage),
        timeoutMs: maxDurationMs,
      });
      const result = await recognised;
      attempts.push({ provider: "browser-fallback", ok: result.ok, latencyMs: Date.now() - fbT0, error: result.error });
      lastSttProvider.value = "browser-fallback";
      if (result.ok) setState("IDLE");
      else {
        setState("ERROR");
        options.onError?.(result.error ?? "Fallback recognition produced no transcript");
      }
      return {
        ok: result.ok,
        provider: "browser-fallback",
        text: result.text,
        languageHint: result.languageHint,
        error: result.error,
        latencyMs: Date.now() - t0,
        attempts,
      };
    };

    // The monitor has already told us the local runtime is down — do not make the
    // user wait on a socket we know is dead.
    const known = getVoiceboxStatus();
    if (known.state === "OFF") {
      return fallback(`local Whisper unavailable — ${known.detail ?? "runtime offline"}`);
    }

    setState("REQUESTING_PERMISSION");
    const mic = await ensureMicrophone();
    if (!mic.ok) {
      setState("ERROR");
      const message = mic.message ?? microphoneErrorMessage(new Error("microphone unavailable"));
      options.onError?.(message);
      attempts.push({ provider: "voicebox-whisper", ok: false, latencyMs: 0, error: message });
      return { ok: false, provider: "voicebox-whisper", text: "", error: message, latencyMs: Date.now() - t0, attempts };
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      setState("ERROR");
      const message = microphoneErrorMessage(e);
      options.onError?.(message);
      attempts.push({ provider: "voicebox-whisper", ok: false, latencyMs: 0, error: message });
      return { ok: false, provider: "voicebox-whisper", text: "", error: message, latencyMs: Date.now() - t0, attempts };
    }

    // Voicebox Whisper accepts WAV. A browser WebM recording comes back as
    // HTTP 500, which Astra reports as STT 503, so the doctor is never heard.
    const pcmChunks: Float32Array[] = [];
    let sampleRate = 16000;
    let vadAvailable = false;
    let heardSpeech = false;
    let lastVoiceAt = Date.now();
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("AudioContext unavailable");
      audioContext = new Ctor();
      await audioContext.resume().catch(() => undefined);
      sampleRate = audioContext.sampleRate;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      const mute = audioContext.createGain();
      mute.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (stopped) return;
        pcmChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(mute);
      mute.connect(audioContext.destination);
      const frame = new Uint8Array(analyser.fftSize);
      vadAvailable = true;
      const tick = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(frame);
        let sum = 0;
        for (let i = 0; i < frame.length; i++) {
          const v = (frame[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / frame.length);
        options.onLevel?.(Math.min(1, rms * 12));
        if (rms > silenceThreshold) {
          heardSpeech = true;
          lastVoiceAt = Date.now();
        } else if (heardSpeech && Date.now() - lastVoiceAt > silenceStopMs) {
          stopRequested?.();
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } catch {
      cleanup();
      return fallback("This browser could not open the microphone for Voicebox.");
    }

    setState("LISTENING");

    const stopTimer = setTimeout(() => stopRequested?.(), maxDurationMs);
    const onAbort = () => stopRequested?.();
    signal?.addEventListener("abort", onAbort, { once: true });

    await new Promise<void>((resolve) => {
      stopRequested = () => {
        if (stopped) return;
        stopped = true;
        resolve();
      };
    });
    clearTimeout(stopTimer);
    signal?.removeEventListener("abort", onAbort);

    const audio = encodeWav(mergeFloat32(pcmChunks), sampleRate);
    cleanup();

    if (vadAvailable && !heardSpeech) {
      return {
        ok: false,
        provider: "voicebox-whisper",
        text: "",
        error: "silence",
        latencyMs: Date.now() - t0,
        attempts,
      };
    }

    if (!audio.size) {
      setState("ERROR");
      const message = "No audio was captured — check the microphone input.";
      options.onError?.(message);
      attempts.push({ provider: "voicebox-whisper", ok: false, latencyMs: 0, error: message });
      return { ok: false, provider: "voicebox-whisper", text: "", error: message, latencyMs: Date.now() - t0, attempts };
    }

    // ---- 1. LOCAL WHISPER (primary ear) ----------------------------------
    setState("TRANSCRIBING");
    const sttT0 = Date.now();
    const local = await voiceboxTranscribe(audio, {
      language: preferredLanguage === "auto" ? undefined : preferredLanguage,
      signal,
    });
    attempts.push({ provider: "voicebox-whisper", ok: local.ok, latencyMs: Date.now() - sttT0, error: local.error });
    if (local.ok) {
      lastSttProvider.value = "voicebox-whisper";
      setState("IDLE");
      // Raw audio is dropped here — it is never persisted anywhere.
      return {
        ok: true,
        provider: "voicebox-whisper",
        text: local.text,
        confidence: local.confidence,
        latencyMs: Date.now() - t0,
        attempts,
      };
    }

    // ---- 2. BROWSER FALLBACK (emergency ear) -----------------------------
    return fallback(local.error ?? "local Whisper returned no transcript");
  })().finally(() => {
    if (openedEpoch === voiceSession.epoch()) voiceSession.markIdleIfListening();
    voiceSession.clearMic(stopFn);
  });

  stopFn = () => {
    stopped = true;
    try { stopRequested?.(); } catch { /* noop */ }
    cleanup();
  };
  voiceSession.registerMic(stopFn);
  return { promise, stop: stopFn };
}