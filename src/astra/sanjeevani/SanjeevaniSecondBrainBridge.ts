/**
 * SANJEEVANI AI — Second Brain Knowledge & Memory Bridge
 * =====================================================
 * Canonical bridge connecting Sanjeevani assistant to Astra's
 * persistent second brain (knowledge-data, patient context, clinical rules).
 */

export interface SecondBrainContext {
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  clinicalDirectives?: string[];
  patientContext?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
}

export class SanjeevaniSecondBrainBridge {
  private sessionContext: Map<string, SecondBrainContext> = new Map();

  /** Fetch contextual memory for the current turn. */
  async getContext(sessionId: string): Promise<SecondBrainContext> {
    if (!this.sessionContext.has(sessionId)) {
      this.sessionContext.set(sessionId, {
        history: [],
        clinicalDirectives: [
          "Prioritize patient safety and evidence-based clinical protocols.",
          "Maintain deterministic clarity for medical orders and lab values.",
          "Seamlessly handle multilingual inputs (English, Telugu, Hindi, Tenglish, Hinglish)."
        ]
      });
    }
    return this.sessionContext.get(sessionId)!;
  }

  /** Append an interaction turn to the persistent session memory. */
  async appendTurn(
    sessionId: string,
    turn: { userText: string; assistantResponse: string; metadata?: Record<string, unknown> }
  ): Promise<void> {
    const ctx = await this.getContext(sessionId);
    ctx.history.push({ role: "user", content: turn.userText });
    ctx.history.push({ role: "assistant", content: turn.assistantResponse });
    // Keep context window bounded for low-latency voice responses
    if (ctx.history.length > 20) {
      ctx.history = ctx.history.slice(-20);
    }
  }

  /** Clear session context upon doctor logout or session reset. */
  clearSession(sessionId: string): void {
    this.sessionContext.delete(sessionId);
  }
  clearPatientContext(sessionId: string): void { this.clearSession(sessionId); }
}

export const sanjeevaniSecondBrainBridge = new SanjeevaniSecondBrainBridge();
