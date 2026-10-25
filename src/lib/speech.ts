import { useCallback, useEffect, useRef, useState } from "react";
import { voiceboxSpeak, voiceboxTranscribe, VOICE_PROFILES, type VoiceboxStatus } from "./voicebox";
import { chunkForSpeech, polishForSpeech, spokenFor, type SpeechChunk } from "./voiceSpeech";
import { unlockAstraAudio } from "@/astra/voice/roundTrip/ttsFallback";
import { speakSaarathi } from "@/astra/voice/providers/ttsPriority";

/**
 * Browser SpeechRecognition (push-to-talk) — works in Chrome/Edge with mic
 * permission. Graceful `supported: false` when the API is absent.
 */

interface SpeechRecognitionAlternative { transcript: string; }
interface SpeechRecognitionResultList { [index: number]: { [index: number]: SpeechRecognitionAlternative; isFinal: boolean }; length: number; }
interface SpeechRecognitionEventLike { resultIndex: number; results: SpeechRecognitionResultList; }
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechState {
  supported: boolean;
  listening: boolean;
  /** finalized transcript chunks */
  transcript: string;
  /** live interim text while speaking */
  interim: string;
  error?: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechRecognition(): SpeechState {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | undefined>();
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const supported = getCtor() !== null;

  useEffect(() => {
    return () => {
      try { recRef.current?.abort(); } catch { /* noop */ }
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    try { recRef.current?.abort(); } catch { /* noop */ }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let final = "";
      let inter = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) final += text + " ";
        else inter += text;
      }
      if (final) setTranscript((p) => (p + " " + final).trim());
      setInterim(inter);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.onerror = (e) => {
      setListening(false);
      setInterim("");
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone permission denied — allow mic access or use typed dictation below."
          : `Speech recognition error: ${e.error ?? "unknown"}`
      );
    };
    recRef.current = rec;
    setError(undefined);
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone — use typed dictation below.");
    }
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(undefined);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}

/* ------------------------------------------------------------------ */
/*  Local voice engine — Voicebox (Whisper STT + Qwen3 TTS) first,    */
/*  browser SpeechRecognition may capture input; output is Voicebox-only. */
/*  One hook drives the mic, playback, barge-in and smart resume.      */
/* ------------------------------------------------------------------ */

interface VADHandle {
  stop: () => void;
}

/** Voice-activity detector: raw mic RMS sustained above a speech threshold. */
async function startVAD(onSpeech: () => void): Promise<VADHandle | null> {
  let stream: MediaStream | null = null;
  let raf = 0;
  let highFor = 0;
  let triggered = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ac = new AudioContext();
    const src = ac.createMediaStreamSource(stream);
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      highFor = rms > 0.035 ? highFor + 32 : 0;
      if (highFor >= 280 && !triggered) {
        triggered = true;
        onSpeech();
      } else if (!triggered) {
        raf = requestAnimationFrame(loop);
      }
    };
    raf = requestAnimationFrame(loop);
  } catch {
    return null;
  }
  return {
    stop: () => {
      cancelAnimationFrame(raf);
      try { stream?.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    },
  };
}

export interface LocalVoiceState {
  source: "voicebox" | "browser" | null;
  recording: boolean;
  interim: string;
  transcript: string;
  listeningError?: string;
  speaking: boolean;
  speakingText: string;
  canUseTts: boolean;
  interruptedRemainder: string | null;
  startListening: () => void;
  stopListening: () => Promise<void>;
  cancelListening: () => void;
  speak: (displayText: string, lang: "en" | "te" | "hi") => Promise<void>;
  speakRaw: (text: string, lang: "en" | "te" | "hi") => Promise<void>;
  stopSpeaking: (keepResume?: boolean) => void;
  resumeSpeaking: () => void;
  reset: () => void;
}

export function useLocalVoice(voicebox: VoiceboxStatus): LocalVoiceState {
  const [source, setSource] = useState<LocalVoiceState["source"]>(null);
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [transcript, setTranscript] = useState("");
  const [listeningError, setListeningError] = useState<string | undefined>();
  const [speaking, setSpeaking] = useState(false);
  const [speakingText, setSpeakingText] = useState("");
  const [interruptedRemainder, setInterruptedRemainder] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const srRef = useRef<SpeechRecognitionInstance | null>(null);
  const vadRef = useRef<VADHandle | null>(null);
  const speakToken = useRef(0);
  const remainderRef = useRef<string | null>(null);
  const queueRef = useRef<SpeechChunk[]>([]);
  const speakingRef = useRef(false);
  const transcriptRef = useRef("");
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const setTranscriptState = useCallback((t: string) => {
    transcriptRef.current = t;
    setTranscript(t);
  }, []);

  const emitTranscript = useCallback((t: string) => {
    const clean = t.trim();
    if (!clean) return;
    setTranscriptState(clean);
    window.dispatchEvent(new CustomEvent("Astra:transcript", { detail: clean }));
  }, [setTranscriptState]);

  useEffect(() => {
    return () => {
      try { recRef.current?.stop(); } catch { /* noop */ }
      try { srRef.current?.abort(); } catch { /* noop */ }
      vadRef.current?.stop();
      speakToken.current += 1;
    };
  }, []);

  /* ---------------- STT ---------------- */

  const startVoiceboxCapture = useCallback(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setListeningError("Microphone capture unavailable in this browser.");
      return;
    }
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        recStreamRef.current = stream;
        recChunks.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) recChunks.current.push(e.data);
        };
        rec.start();
        recRef.current = rec;
        setRecording(true);
      } catch {
        setListeningError("Microphone permission denied — allow mic access to speak.");
      }
    })();
  }, []);

  const startBrowserRecognition = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setListeningError("No speech recognition available — type your request.");
      return;
    }
    try { srRef.current?.abort(); } catch { /* noop */ }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let final = "";
      let inter = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) final += text + " ";
        else inter += text;
      }
      if (final) setTranscriptState((transcriptRef.current + " " + final).trim());
      setInterim(inter);
    };
    rec.onend = () => {
      setRecording(false);
      setInterim("");
    };
    rec.onerror = (e) => {
      setRecording(false);
      setInterim("");
      setListeningError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone permission denied — allow mic access."
          : `Speech recognition error: ${e.error ?? "unknown"}`
      );
    };
    srRef.current = rec;
    setListeningError(undefined);
    try {
      rec.start();
      setRecording(true);
    } catch {
      setListeningError("Could not start the microphone.");
    }
  }, [setTranscriptState]);

  const startListening = useCallback(() => {
    // A real user gesture: unlock audio so Astra's answer can actually be heard.
    unlockAstraAudio();
    setTranscriptState("");
    setInterim("");
    if (voicebox === "online") {
      setSource("voicebox");
      startVoiceboxCapture();
    } else if (getCtor()) {
      setSource("browser");
      startBrowserRecognition();
    } else {
      setSource(null);
      setListeningError("No voice input available — Voicebox is offline and this browser has no speech recognition.");
    }
  }, [voicebox, setTranscriptState, startVoiceboxCapture, startBrowserRecognition]);

  const stopListening = useCallback(async () => {
    if (source === "voicebox") {
      const rec = recRef.current;
      if (!rec || rec.state === "inactive") {
        setRecording(false);
        return;
      }
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        rec.stop();
      });
      recRef.current = null;
      try { recStreamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch { /* noop */ }
      recStreamRef.current = null;
      setRecording(false);
      try {
        const blob = new Blob(recChunks.current, { type: recChunks.current[0]?.type ?? "audio/webm" });
        if (blob.size < 512) return;
        const text = await voiceboxTranscribe(blob);
        emitTranscript(text);
      } catch (e) {
        setListeningError(e instanceof Error ? e.message : "Transcription failed — type your request instead.");
      }
      return;
    }
    if (source === "browser") {
      try { srRef.current?.stop(); } catch { /* noop */ }
      setRecording(false);
      setInterim("");
      emitTranscript(transcriptRef.current);
      return;
    }
    setRecording(false);
  }, [source, emitTranscript]);

  const cancelListening = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    try { srRef.current?.abort(); } catch { /* noop */ }
    recRef.current = null;
    try { recStreamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch { /* noop */ }
    recStreamRef.current = null;
    setRecording(false);
    setInterim("");
  }, []);

  /* ---------------- TTS ---------------- */

  const interrupt = useCallback(() => {
    speakToken.current += 1;
    vadRef.current?.stop();
    vadRef.current = null;
    const el = audioElRef.current;
    if (el) {
      audioElRef.current = null;
      try {
        el.pause();
        el.dispatchEvent(new Event("ended"));
      } catch { /* noop */ }
    }
    const rem = queueRef.current.map((c) => c.text).join(" ");
    remainderRef.current = rem || null;
    setInterruptedRemainder(rem || null);
    speakingRef.current = false;
    setSpeaking(false);
    setSpeakingText("");
  }, []);

  const interruptRef = useRef(interrupt);
  useEffect(() => {
    interruptRef.current = interrupt;
  }, [interrupt]);

  const stopSpeaking = useCallback(
    (keepResume = true) => {
      if (!keepResume) {
        remainderRef.current = null;
        setInterruptedRemainder(null);
      }
      queueRef.current = [];
      interrupt();
    },
    [interrupt]
  );

  const startBargeIn = useCallback(() => {
    vadRef.current?.stop();
    void startVAD(() => interruptRef.current()).then((vad) => {
      if (vad && speakingRef.current) vadRef.current = vad;
      else vad?.stop();
    });
  }, []);

  const speakChunked = useCallback(
    async (text: string, lang: "en" | "te" | "hi", raw: boolean) => {
      const spoken = raw ? polishForSpeech(text) : spokenFor(text);
      const chunks = chunkForSpeech(spoken);
      if (chunks.length === 0) return;
      const token = ++speakToken.current;
      queueRef.current = [...chunks];
      speakingRef.current = true;
      setSpeaking(true);
      setSpeakingText(chunks[0].text);
      startBargeIn();
      const profile = VOICE_PROFILES[lang];
      // Voicebox speaks short local lines. If it is down, Sarvam then Gemini speak.
      // Browser speech synthesis is not used.
      let useVoicebox = voicebox === "online";

      for (let i = 0; i < chunks.length; i++) {
        if (token !== speakToken.current) break;
        const chunk = chunks[i];
        setSpeakingText(chunk.text);
        try {
          if (useVoicebox) {
            const blob = await voiceboxSpeak(chunk.text, profile.voice);
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioElRef.current = audio;
            await new Promise<void>((res, rej) => {
              let done = false;
              const finish = () => {
                if (!done) {
                  done = true;
                  res();
                }
              };
              audio.onended = finish;
              audio.onerror = () => {
                if (!done) {
                  done = true;
                  rej(new Error("audio decode failed"));
                }
              };
              void audio.play().catch(() => finish());
            });
            audioElRef.current = null;
            URL.revokeObjectURL(url);
          } else {
            const fallback = await speakSaarathi({
              text: chunk.text,
              language: lang === "te" ? "te-IN" : lang === "hi" ? "hi-IN" : "en-IN",
              mouths: ["sarvam", "gemini-live"],
            });
            if (!fallback.ok) {
              setListeningError(fallback.error ?? "Speech output unavailable.");
              if (token === speakToken.current) stopSpeaking(true);
              return;
            }
          }
          if (token === speakToken.current && queueRef.current.length > 0) queueRef.current.shift();
          if (chunk.pauseMs > 0 && token === speakToken.current) {
            await new Promise<void>((res) => setTimeout(res, chunk.pauseMs));
          }
        } catch {
          useVoicebox = false;
          const fallback = await speakSaarathi({
            text: chunk.text,
            language: lang === "te" ? "te-IN" : lang === "hi" ? "hi-IN" : "en-IN",
            mouths: ["sarvam", "gemini-live"],
          });
          if (!fallback.ok) {
            setListeningError(fallback.error ?? "Speech output unavailable.");
            if (token === speakToken.current) stopSpeaking(true);
            return;
          }
        }
      }

      if (token === speakToken.current) {
        queueRef.current = [];
        speakingRef.current = false;
        vadRef.current?.stop();
        vadRef.current = null;
        setSpeaking(false);
        setSpeakingText("");
      }
    },
    [voicebox, startBargeIn, stopSpeaking]
  );

  const speak = useCallback(
    (displayText: string, lang: "en" | "te" | "hi") => speakChunked(displayText, lang, false),
    [speakChunked]
  );

  const speakRaw = useCallback(
    (text: string, lang: "en" | "te" | "hi") => speakChunked(text, lang, true),
    [speakChunked]
  );

  const resumeSpeaking = useCallback(() => {
    const rem = remainderRef.current;
    if (!rem) return;
    remainderRef.current = null;
    setInterruptedRemainder(null);
    void speakRaw(`Continuing from where I stopped — ${rem}`, "en");
  }, [speakRaw]);

  const reset = useCallback(() => {
    cancelListening();
    stopSpeaking(false);
    setTranscriptState("");
    setInterim("");
  }, [cancelListening, stopSpeaking, setTranscriptState]);

  return {
    source,
    recording,
    interim,
    transcript,
    listeningError,
    speaking,
    speakingText,
    canUseTts: true,
    interruptedRemainder,
    startListening,
    stopListening,
    cancelListening,
    speak,
    speakRaw,
    stopSpeaking,
    resumeSpeaking,
    reset,
  };
}
