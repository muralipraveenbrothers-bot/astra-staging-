import { useState, useEffect, useCallback } from "react";
import {
  VoiceboxProfile,
  VOICEBOX_3_PROFILES,
  VoiceboxProfileMeta,
  detectVoiceboxProfile,
  speakHumanVoice,
  stopActiveSpeech
} from "../utils/audioAlerts";
import { apiFetch, authHeaders } from "@/services/apiFetch";

export const VOICEBOX_API_BASE = "http://127.0.0.1:17493";

export interface UseVoiceboxOptions {
  department?: string; // e.g., "doctor", "reception", "counselor", "pharmacy"
  mode?: string;       // e.g., "copilot", "patient_psychology", "patient_facing", etc.
  overrideProfile?: VoiceboxProfile | "auto";
  clientId?: string;   // default: "astra-copilot"
}

export interface VoiceboxSpeakOptions {
  profile?: VoiceboxProfile;
  language?: string;
  personality?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

export function useVoicebox(options: UseVoiceboxOptions = {}) {
  const { department = "doctor", mode, overrideProfile = "auto", clientId = "astra-copilot" } = options;

  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [availableProfiles] = useState<VoiceboxProfileMeta[]>(
    Object.values(VOICEBOX_3_PROFILES)
  );
  const [isLocalVoiceboxConnected, setIsLocalVoiceboxConnected] = useState<boolean>(false);

  // Department-driven & Mode-driven 3-Voice Profile Switching Logic
  const resolveProfile = useCallback(
    (textForContext: string = "", customProfile?: VoiceboxProfile): VoiceboxProfile => {
      if (customProfile) return customProfile;
      if (overrideProfile && overrideProfile !== "auto") return overrideProfile;

      const deptLower = (department || "").toLowerCase();
      const modeLower = (mode || "").toLowerCase();

      // 1. Reception / Frontdesk / Billing -> female_voice_2 (Receptionist)
      if (
        deptLower.includes("reception") ||
        deptLower.includes("billing") ||
        deptLower.includes("frontdesk") ||
        deptLower.includes("scheduling") ||
        modeLower.includes("patient_facing")
      ) {
        return "female_voice_2";
      }

      // 2. Counselor / Psychology / Maternity -> female_voice_1 (Counselor)
      if (
        deptLower.includes("counselor") ||
        deptLower.includes("counseling") ||
        deptLower.includes("maternity") ||
        modeLower.includes("patient_psychology") ||
        modeLower.includes("attendant_psychology") ||
        modeLower.includes("coach")
      ) {
        return "female_voice_1";
      }

      // 3. Doctor / Clinical / Pharmacy -> male_voice (Doctor)
      if (
        deptLower.includes("doctor") ||
        deptLower.includes("clinical") ||
        deptLower.includes("pharmacy") ||
        modeLower.includes("diagnostic") ||
        modeLower.includes("reasoning") ||
        modeLower.includes("copilot") ||
        modeLower.includes("roleplay") ||
        modeLower.includes("consultant")
      ) {
        return "male_voice";
      }

      // Fallback text context classifier
      return detectVoiceboxProfile(textForContext, mode, department);
    },
    [department, mode, overrideProfile]
  );

  const activeProfile = resolveProfile();
  const activeProfileMeta = VOICEBOX_3_PROFILES[activeProfile];

  // Test active status of local Voicebox REST server (http://127.0.0.1:17493)
  useEffect(() => {
    let isMounted = true;
    const checkVoiceboxConnection = async () => {
      try {
        const res = await fetch(`${VOICEBOX_API_BASE}/profiles`, {
          method: "GET",
          headers: { "X-Voicebox-Client-Id": clientId }
        });
        if (res.ok && isMounted) {
          setIsLocalVoiceboxConnected(true);
        }
      } catch (e) {
        if (isMounted) setIsLocalVoiceboxConnected(false);
      }
    };
    checkVoiceboxConnection();
    return () => {
      isMounted = false;
    };
  }, [clientId]);

  // Speak method calling Voicebox REST API
  const speak = useCallback(
    async (
      textToSpeak: string,
      profileOrOpts?: VoiceboxProfile | VoiceboxSpeakOptions,
      optsObj?: VoiceboxSpeakOptions
    ) => {
      if (!textToSpeak.trim()) return;

      stopActiveSpeech();

      let speakOpts: VoiceboxSpeakOptions = {};
      if (typeof profileOrOpts === "string") {
        speakOpts = { profile: profileOrOpts, ...(optsObj || {}) };
      } else if (profileOrOpts) {
        speakOpts = profileOrOpts;
      }

      const profileToUse = speakOpts.profile || resolveProfile(textToSpeak, speakOpts.profile);
      const languageToUse = speakOpts.language || "en";

      setIsSpeaking(true);
      if (speakOpts.onStart) speakOpts.onStart();

      try {
        let audioUrl: string | null = null;

        // 1. Direct call to local Voicebox REST endpoint POST http://127.0.0.1:17493/speak
        try {
            const voiceProfileForVb = profileToUse === "jarvis" ? "JARVIS" : profileToUse;
            const directRes = await fetch(`${VOICEBOX_API_BASE}/speak`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Voicebox-Client-Id": clientId,
              },
              body: JSON.stringify({
                text: textToSpeak,
                profile: voiceProfileForVb,
                engine: profileToUse === "jarvis" ? "kokoro" : undefined,
                language: languageToUse,
                personality: speakOpts.personality ?? false,
              }),
            });

            if (directRes.ok) {
              const data = await directRes.json();
              audioUrl = data.audio_url || data.url || data.audio || (data.id ? `${VOICEBOX_API_BASE}/audio/${data.id}` : null);
            }
        } catch (directErr) {
          // Direct local call unavailable or blocked
        }

        // 2. Try POST http://127.0.0.1:17493/generate if /speak was quiet
        if (!audioUrl) {
          try {
            const genRes = await fetch(`${VOICEBOX_API_BASE}/generate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Voicebox-Client-Id": clientId,
              },
              body: JSON.stringify({
                text: textToSpeak,
                profile_id: profileToUse,
                language: languageToUse,
              }),
            });

            if (genRes.ok) {
              const data = await genRes.json();
              audioUrl = data.audio_url || data.url;
            }
          } catch (e) {}
        }

        // 3. Fallback to the real Astra API Voicebox route (POST /api/voice/speak,
        //    login required). It returns the finished audio as binary audio/wav.
        if (!audioUrl) {
          const proxyRes = await apiFetch("/api/voice/speak", {
            method: "POST",
            headers: authHeaders(true),
            body: JSON.stringify({
              text: textToSpeak,
              profile: profileToUse,
            }),
          });

          if (proxyRes.ok) {
            const ct = proxyRes.headers.get("content-type") || "";
            if (ct.startsWith("audio/")) {
              audioUrl = URL.createObjectURL(await proxyRes.blob());
            } else if (ct.includes("application/json")) {
              const data = await proxyRes.json();
              audioUrl = data.audioUrl || data.audio_url || data.url;
            }
          }
        }

        if (audioUrl) {
          const audio = new Audio(audioUrl);
          audio.playbackRate = profileToUse === "female_voice_1" ? 0.88 : profileToUse === "male_voice" ? 0.95 : 1.0;

          audio.onended = () => {
            setIsSpeaking(false);
            if (speakOpts.onEnd) speakOpts.onEnd();
          };

          audio.onerror = (e) => {
            console.warn("Voicebox audio player warning:", e);
            setIsSpeaking(false);
            if (speakOpts.onError) speakOpts.onError(e);
            else if (speakOpts.onEnd) speakOpts.onEnd();
          };

          await audio.play();
        } else {
          // Stream voice via speakHumanVoice
          speakHumanVoice(
            textToSpeak,
            speakOpts.onStart,
            () => {
              setIsSpeaking(false);
              if (speakOpts.onEnd) speakOpts.onEnd();
            },
            () => {
              setIsSpeaking(false);
              if (speakOpts.onError) speakOpts.onError("Audio playback failed");
            },
            "conversational",
            languageToUse,
            profileToUse
          );
        }
      } catch (err) {
        console.error("Voicebox speak exception:", err);
        setIsSpeaking(false);
        if (speakOpts.onError) speakOpts.onError(err);
      }
    },
    [clientId, resolveProfile]
  );

  // Transcribe audio using Voicebox Whisper Turbo endpoint (POST http://127.0.0.1:17493/transcribe)
  const transcribe = useCallback(
    async (audioFileOrBlob: Blob | File, model: string = "whisper-turbo"): Promise<string> => {
      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append("audio", audioFileOrBlob, "recording.wav");
        formData.append("model", model);

        try {
          const directRes = await fetch(`${VOICEBOX_API_BASE}/transcribe`, {
            method: "POST",
            headers: {
              "X-Voicebox-Client-Id": clientId,
            },
            body: formData,
          });

          if (directRes.ok) {
            const data = await directRes.json();
            setIsTranscribing(false);
            return data.text || data.transcript || "";
          }
        } catch (e) {}

        // Fallback: real Astra API Voicebox STT route (multipart, login required).
        const proxyRes = await apiFetch("/api/voice/transcribe", {
          method: "POST",
          body: formData,
        });

        if (proxyRes.ok) {
          const data = await proxyRes.json();
          setIsTranscribing(false);
          return data.text || data.transcript || "";
        }

        setIsTranscribing(false);
        return "";
      } catch (err) {
        console.error("Voicebox transcribe error:", err);
        setIsTranscribing(false);
        throw err;
      }
    },
    [clientId]
  );

  const stopSpeech = useCallback(() => {
    stopActiveSpeech();
    setIsSpeaking(false);
  }, []);

  return {
    speak,
    transcribe,
    stopSpeech,
    isSpeaking,
    isTranscribing,
    activeProfile,
    activeProfileMeta,
    availableProfiles,
    isLocalVoiceboxConnected,
    resolveProfile,
  };
}
