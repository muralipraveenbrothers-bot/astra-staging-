import { useCallback, useRef, useState } from "react";
import { startSaarathiListening } from "@/astra/voice/providers/sttPriority";
import { speakAstra, stopAstraSpeech, unlockAstraAudio } from "@/astra/voice/roundTrip/ttsFallback";
import { interpretHeard, UNCLEAR_PROMPT } from "@/astra/voice/safety/voiceSafety";
import { voiceSession } from "@/astra/voice/safety/voiceSession";

export interface LocalDictationOptions {
  language: string;
  maxDurationMs?: number;
  silenceStopMs?: number;
  autoSendFinal?: boolean;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}

export function useLocalDictation(options: LocalDictationOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [liveText, setLiveText] = useState("");
  const stopRef = useRef<(() => void) | null>(null);
  const genRef = useRef(0);
  const unclearAskedRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const stop = useCallback(() => {
    genRef.current += 1;
    stopRef.current?.();
    stopRef.current = null;
    setIsRecording(false);
    setLiveText("");
  }, []);

  const start = useCallback(() => {
    const opts = optionsRef.current;
    const gen = ++genRef.current;
    unlockAstraAudio();
    stopAstraSpeech();
    setIsRecording(true);
    setLiveText("");
    const handle = startSaarathiListening({
      preferredLanguage: opts.language,
      maxDurationMs: opts.maxDurationMs ?? 7000,
      silenceStopMs: opts.silenceStopMs ?? 650,
      allowBrowserFallback: false,
      manual: true,
      onStateChange: (state) => {
        if (genRef.current !== gen) return;
        if (state === "LISTENING") setIsRecording(true);
      },
      onError: (message) => opts.onError?.(message),
    });
    stopRef.current = handle.stop;
    void handle.promise.then((result) => {
      if (genRef.current !== gen) return;
      stopRef.current = null;
      setIsRecording(false);
      const text = result.text.trim();
      setLiveText(text);
      const latest = optionsRef.current;
      const heard = interpretHeard({
        text,
        confidence: result.confidence,
        agentNames: voiceSession.agentNames(),
        unclearAlreadyAsked: unclearAskedRef.current,
      });
      if (heard.kind === "stop") {
        voiceSession.hardStop({ reason: "stop-word", replyOkay: true });
        return;
      }
      if (heard.kind === "unclear-once") {
        unclearAskedRef.current = true;
        void speakAstra({ text: UNCLEAR_PROMPT, language: "en" });
        return;
      }
      if (heard.kind === "unclear-wait") return;
      if (result.ok && text) unclearAskedRef.current = false;
      if (result.ok && text && latest.autoSendFinal !== false && heard.kind === "accept") latest.onFinal?.(text);
      if (!result.ok && result.error && result.error !== "silence" && result.error !== "suppressed") latest.onError?.(result.error);
    });
  }, []);

  return { isRecording, liveText, start, stop };
}
