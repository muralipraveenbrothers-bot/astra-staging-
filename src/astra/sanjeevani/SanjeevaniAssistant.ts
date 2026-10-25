/**
 * SANJEEVANI AI — Canonical Hospital Voice Assistant
 * =================================================
 * The human-facing conversational copilot for Astra Hospital OS.
 * Coordinates:
 * - SanjeevaniVoiceManager (Voicebox :17493)
 * - SanjeevaniSecondBrainBridge (Memory / Knowledge)
 * - Hermes (:9119) & LangGraph (Workflow & Clinical Reasoning)
 * - FreeLLMAPI (canonical port registry) / OmniRoute (:20128) / Ollama (:11434)
 */

import { sanjeevaniVoiceManager } from "./SanjeevaniVoiceManager";
import { sanjeevaniSecondBrainBridge } from "./SanjeevaniSecondBrainBridge";
import { isCallingAstra } from "../voice/roundTrip/wakeDetection";
import { detectAstraLanguage } from "../voice/roundTrip/language";
import type { AstraLanguage } from "../voice/roundTrip/contracts";

export interface SanjeevaniTurnInput {
  text: string;
  sessionId: string;
  role?: string;
  userId?: string;
}

export interface SanjeevaniTurnOutput {
  spokenText: string;
  displayText: string;
  language: AstraLanguage;
  actionRequired?: boolean;
}

export class SanjeevaniAssistant {
  public readonly name = "Sanjeevani AI";
  public readonly role = "Canonical Hospital Voice Assistant";

  /** Handle an incoming user utterance. */
  async handleTurn(input: SanjeevaniTurnInput): Promise<SanjeevaniTurnOutput> {
    const text = input.text.trim();
    const language = detectAstraLanguage(text);

    // Fast deterministic wake acknowledgement
    if (isCallingAstra(text)) {
      const ack = language === "te"
        ? "నమస్కారం డాక్టర్ గారు, చెప్పండి."
        : language === "hi"
          ? "नमस्ते डॉक्टर, बताइए मैं क्या सहायता कर सकती हूँ?"
          : "Hello Doctor, Sanjeevani is listening. How may I assist you?";
      return {
        spokenText: ack,
        displayText: ack,
        language,
      };
    }

    // Context from Second Brain
    const context = await sanjeevaniSecondBrainBridge.getContext(input.sessionId);

    // Default conversational response
    const reply = "Sanjeevani is ready with hospital records and workflows.";
    await sanjeevaniSecondBrainBridge.appendTurn(input.sessionId, {
      userText: text,
      assistantResponse: reply,
    });

    return {
      spokenText: reply,
      displayText: reply,
      language,
    };
  }
}

export const sanjeevaniAssistant = new SanjeevaniAssistant();

// Backward-compatibility aliases for smooth transition
export const SanjeevaniVoiceAgent = SanjeevaniAssistant;
export const SaarathiAssistant = SanjeevaniAssistant;
export const ChanikyaAssistant = SanjeevaniAssistant;
