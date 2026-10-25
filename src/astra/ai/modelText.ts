/**
 * ASTRA SAARATHI — model response extraction (repair prompt §H).
 * =============================================================
 * Why this exists: HTTP 200 was being treated as success. A provider that
 * answered with `{}`, `{"error": ...}`, tool-call metadata only, an empty
 * `content`, or a truncated JSON body produced the user-facing
 *   "Saarathi heard you, but Astra returned an empty answer. Nothing was changed."
 * which told the doctor nothing and hid a real upstream failure.
 *
 * RULE: transport success is NOT answer success. An answer must be a non-empty
 * string, and every shape below is checked defensively because providers disagree
 * about where the text lives.
 */

/** Raised when a provider answered but produced no usable text. */
export class EmptyModelResponseError extends Error {
  readonly provider: string;
  constructor(provider: string, detail?: string) {
    super(`${provider} returned no usable answer${detail ? `: ${detail}` : ""}`);
    this.name = "EmptyModelResponseError";
    this.provider = provider;
  }
}

/** The one definition of "usable answer" used across the whole voice/brain path. */
export function hasUsableAnswer(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function firstUsableString(candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (hasUsableAnswer(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Pull the answer text out of ANY supported provider response shape.
 * Returns `undefined` (never a placeholder string) when there is no answer.
 */
export function extractModelText(response: unknown): string | undefined {
  if (response === null || response === undefined) return undefined;
  if (typeof response === "string") return hasUsableAnswer(response) ? response : undefined;
  if (typeof response !== "object") return undefined;

  const root = response as Record<string, any>;

  // --- OpenAI-compatible chat completion ---------------------------------
  const choice = Array.isArray(root.choices) ? root.choices[0] : undefined;
  const fromChoice = firstUsableString([
    choice?.message?.content,
    choice?.delta?.content,
    choice?.text,
    choice?.message?.reasoning_content,
  ]);
  if (fromChoice) return fromChoice;

  // --- Native provider shapes --------------------------------------------
  const fromNative = firstUsableString([
    root.text,
    root.answer,
    root.reply,
    root.response,
    root.content,
    root.output_text,
    root.message?.content,
    root.result?.text,
    root.result?.answer,
    root.data?.text,
    root.data?.answer,
    root.payload?.text,
  ]);
  if (fromNative) return fromNative;

  // --- Anthropic / Gemini style content blocks ---------------------------
  if (Array.isArray(root.content)) {
    const joined = root.content
      .map((block: any) => (typeof block === "string" ? block : block?.text))
      .filter((part: unknown): part is string => hasUsableAnswer(part))
      .join("\n")
      .trim();
    if (hasUsableAnswer(joined)) return joined;
  }
  const geminiPart = root.candidates?.[0]?.content?.parts?.find((part: any) => hasUsableAnswer(part?.text));
  if (geminiPart) return geminiPart.text as string;

  // --- Nested Astra envelope: { astra: {...}, text } ---------------------
  if (typeof root.astra === "object" && root.astra !== null) {
    const nested = extractModelText(root.astra);
    if (nested) return nested;
  }

  // NOTE: tool-call-only responses deliberately return undefined. Metadata is not
  // an answer, and treating it as one is exactly what produced the empty-answer bug.
  return undefined;
}

/**
 * Extract or throw. Callers use this so an empty upstream answer can never leak
 * into the UI as a "reply".
 */
export function requireModelText(response: unknown, provider: string): string {
  const text = extractModelText(response);
  if (!text) {
    throw new EmptyModelResponseError(provider, describeEmptyResponse(response));
  }
  return text.trim();
}

/** Short, non-sensitive description used for diagnostics and the audit log. */
export function describeEmptyResponse(response: unknown): string {
  if (response === null) return "body was null";
  if (response === undefined) return "body was undefined";
  if (typeof response === "string") return "body was an empty string";
  if (typeof response !== "object") return `body was ${typeof response}`;
  const keys = Object.keys(response as Record<string, unknown>);
  if (keys.length === 0) return "body was an empty object";
  if (keys.includes("error")) {
    const error = (response as Record<string, any>).error;
    const message = typeof error === "string" ? error : error?.message ?? error?.code;
    return `provider error: ${String(message ?? "unknown").slice(0, 180)}`;
  }
  return `no text field in keys [${keys.slice(0, 8).join(", ")}]`;
}