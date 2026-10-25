/**
 * ASTRA AI — Voice Humanizer (§robotic → real human)
 * =================================================
 * Post-processes raw TTS audio (kokoro/voicebox) with an ffmpeg signal chain
 * that adds the qualities synthetic speech lacks:
 *   1. highpass + lowpass  : remove sub-rumble and harsh sibilance
 *   2. acompressor         : even out the flat dynamics of neural TTS
 *   3. aecho               : subtle room reverb → "recorded in a real space"
 *   4. firequalizer        : warmth + presence + de-ess shaping
 *   5. loudnorm (EBU R128) : broadcast-standard loudness consistency
 *
 * The chain is intentionally gentle — it preserves intelligibility (clinical
 * safety) while removing the "dead studio" robotic quality. All processing
 * preserves the input sample rate and mono channel layout.
 *
 * Graceful degradation: if ffmpeg is unavailable or fails, the original buffer
 * is returned untouched so voice mode never breaks.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let cachedFfmpeg: string | null = null;

function findFfmpeg(): string | null {
  if (cachedFfmpeg) return cachedFfmpeg;
  const candidates = ["ffmpeg"];
  for (const c of candidates) {
    try {
      const { execSync } = require("node:child_process");
      execSync(`where ${c}`, { stdio: "ignore" });
      cachedFfmpeg = c;
      return c;
    } catch { /* try next */ }
  }
  return null;
}

export type HumanizeStrength = "natural" | "warm" | "broadcast";

const PRESETS: Record<HumanizeStrength, { comp: string; echo: string; eq: string }> = {
  // Default: subtle, preserves clinical intelligibility
  natural: {
    comp: "threshold=-24dB:ratio=3:attack=5:release=60:makeup=2",
    echo: "0.8:0.7:40|50:0.3|0.2",
    eq: "entry(0,3);entry(200,2);entry(1000,0);entry(3000,1);entry(5000,-1);entry(8000,-2)",
  },
  // Warmer, more presence — friendly receptionist / patient educator
  warm: {
    comp: "threshold=-20dB:ratio=3.5:attack=4:release=80:makeup=3",
    echo: "0.85:0.75:45|55:0.35|0.25",
    eq: "entry(0,4);entry(200,3);entry(800,1);entry(2500,0);entry(5000,-1);entry(8000,-3)",
  },
  // Tighter, more compressed — emergency / clinical-copilot clarity
  broadcast: {
    comp: "threshold=-28dB:ratio=4:attack=3:release=50:makeup=3",
    echo: "0.6:0.5:30:0.2",
    eq: "entry(0,2);entry(250,1);entry(1200,0);entry(3500,2);entry(6000,0);entry(8000,-1)",
  },
};

export interface HumanizeOptions {
  strength?: HumanizeStrength;
  /** Target integrated loudness in LUFS (EBU R128). -16 is podcast/broadcast. */
  targetLoudness?: number;
  /** True if ffmpeg is unavailable or fails → caller used the raw buffer. */
  applied?: boolean;
}

/**
 * Humanize a raw PCM/WAV TTS buffer. Returns the processed buffer, or the
 * original if ffmpeg is unavailable or errors (never throws).
 */
export async function humanizeAudio(input: Buffer, opts: HumanizeOptions = {}): Promise<Buffer> {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg || input.length < 100) return input;

    const strength = opts.strength ?? (process.env.ASTRA_VOICE_HUMANIZE_PRESET as HumanizeStrength) ?? "natural";
  const preset = PRESETS[strength] ?? PRESETS.natural;
  const targetLoudness = opts.targetLoudness ?? -16;

  // Read the input sample rate from the WAV header (bytes 24-27) so we can
  // force the chain to preserve it — some filters (aecho) upsample otherwise.
  const inputRate = input.length > 28 ? input.readUInt32LE(24) || 24000 : 24000;

  const dir = mkdtempSync(join(tmpdir(), "astra-voice-"));
  const inputPath = join(dir, "in.wav");
  const outputPath = join(dir, "out.wav");
  try {
    writeFileSync(inputPath, input);

    const af = [
      "highpass=f=80", // remove sub-rumble / handling noise
      "lowpass=f=8000", // tame harsh sibilance above speech band
      `acompressor=${preset.comp}`, // even out flat TTS dynamics
      `aecho=${preset.echo}`, // subtle room presence → not "dead studio"
      `firequalizer=gain_entry='${preset.eq}'`, // warmth + presence + de-ess
      `loudnorm=I=${targetLoudness}:TP=-1.5:LRA=11`, // EBU R128 loudness
    ].join(",");

    const args = [
      "-hide_banner", "-y",
      "-i", inputPath,
      "-af", af,
      "-ac", "1", // keep mono
      "-ar", String(inputRate), // preserve input sample rate exactly
      outputPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString(); });
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 200)}`));
      });
    });

    const out = readFileSync(outputPath);
    // Sanity: reject if processing collapsed the audio to near-silence
    if (out.length < input.length * 0.5) return input;
    return out;
  } catch {
    // Graceful degradation: humanization is cosmetic, never break voice mode
    return input;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Whether the humanizer can run (ffmpeg present). */
export function isHumanizerAvailable(): boolean {
  return findFfmpeg() !== null;
}
