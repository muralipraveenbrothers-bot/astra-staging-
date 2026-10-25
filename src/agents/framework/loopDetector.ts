/**
 * ASTRA AI — Agent Operating Framework: Loop Detector
 * ============================================================================
 * Constitution §22. If the same question × evidence × action × result recurs,
 * STOP instead of burning resources — try a different approach or escalate.
 */

/** Stable fingerprint of one (action, tool, input) pair. */
export interface LoopFingerprint {
  kind: "tool" | "subagent";
  id: string;
  inputKey: string;
}

export function fingerprint(
  kind: "tool" | "subagent",
  id: string,
  input: unknown,
): LoopFingerprint {
  let inputKey = "";
  try {
    // JSON.stringify(undefined) === undefined — normalize so sub-agent calls
    // (which may carry only a task, no input) do not blow up the fingerprint.
    const s = JSON.stringify(input);
    inputKey = s ?? "null";
  } catch {
    inputKey = String(input);
  }
  return { kind, id, inputKey: inputKey.length > 240 ? inputKey.slice(0, 240) : inputKey };
}

export function fingerprintKey(f: LoopFingerprint): string {
  return `${f.kind}:${f.id}:${f.inputKey}`;
}

/**
 * Rolling window of recent action fingerprints. If the same state rehearses
 * `repeatedLimit` times without any new observation shifting the picture, the
 * runner should STOP (return true) and escalate.
 */
export class LoopDetector {
  private readonly window: Map<string, number> = new Map();
  private readonly repeatedLimit: number;

  constructor(repeatedLimit: number = 3, private readonly maxTrackedStates: number = 24) {
    this.repeatedLimit = Math.max(repeatedLimit, 3);
  }

  public record(f: LoopFingerprint, newEvidenceArrived: boolean): boolean {
    if (newEvidenceArrived) this.window.clear();
    const key = fingerprintKey(f);
    const count = (this.window.get(key) ?? 0) + 1;
    this.window.set(key, count);
    if (this.window.size > this.maxTrackedStates) {
      const oldest = this.window.keys().next().value;
      if (oldest !== undefined) this.window.delete(oldest);
    }
    return count >= this.repeatedLimit;
  }

  public reset(): void {
    this.window.clear();
  }
}