/**
 * ASTRA AI — Dr. Mayin speech humanizer tests
 * ===========================================
 * Locks in the three fixes that stopped Dr. Mayin sounding like a machine:
 *   1. clinical/robot text is spoken the way a human says it,
 *   2. the delivery is paced with REAL silence between breath groups,
 *   3. a human voice profile is chosen instead of the JARVIS AI persona.
 */
import { describe, it, expect } from "vitest";
import {
  ROBOT_PERSONA_RE,
  appendPauseToWav,
  expandClinicalAbbreviations,
  humanizeConversation,
  normalizeSpokenNumbers,
  numberToWords,
  pickHumanProfile,
  readWavFormat,
  softenClinicalPhrasing,
  speakListsAsFlow,
  stripMarkup,
  toBreathGroups,
  wavSilence,
  type VoiceboxProfileInfo,
} from "./speechHumanizer";

/** Same 24 kHz mono 16-bit PCM layout the Voicebox runtime really returns. */
function makeWav(seconds: number, sampleRate = 24000): Buffer {
  const frames = Math.floor(seconds * sampleRate);
  const dataSize = frames * 2;
  const buf = Buffer.alloc(44 + dataSize, 0);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

function wavSeconds(buf: Buffer): number {
  const fmt = readWavFormat(buf)!;
  const dataSize = buf.readUInt32LE(40);
  return dataSize / (fmt.sampleRate * (fmt.bitsPerSample / 8) * fmt.channels);
}

describe("speechHumanizer — markup removal", () => {
  it("strips code fences, tables, links, emoji and AI disclaimers", () => {
    const raw = [
      "## Ward round",
      "| Bed | Status |",
      "|-----|--------|",
      "As an AI language model, I can help. 🏥",
      "See [census](https://example.com/x) and `SpO2`.",
      "```js",
      "const x = 1;",
      "```",
    ].join("\n");
    const out = stripMarkup(raw);
    expect(out).not.toContain("```");
    expect(out).not.toContain("|");
    expect(out).not.toContain("https://");
    expect(out).not.toContain("#");
    expect(out).not.toContain("As an AI language model");
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(out).toContain("census");
    expect(out).toContain("SpO2");
  });
});

describe("speechHumanizer — pronunciation", () => {
  it("expands clinical abbreviations to spoken words", () => {
    expect(expandClinicalAbbreviations("CBC and CRP are pending")).toBe(
      "complete blood count and C reactive protein are pending",
    );
    expect(expandClinicalAbbreviations("SpO2 94% on room air")).toContain("oxygen saturation");
    expect(expandClinicalAbbreviations("Give IV fluids STAT")).toBe("Give intravenous fluids immediately");
  });

  it("never rewrites an abbreviation inside a longer word", () => {
    expect(expandClinicalAbbreviations("contact scale")).toBe("contact scale");
    expect(expandClinicalAbbreviations("No SC or IV access")).toContain("subcutaneous");
  });

  it("reads numbers the way a person says them", () => {
    expect(numberToWords(12.5)).toBe("twelve point five");
    expect(numberToWords(65)).toBe("sixty five");
    expect(normalizeSpokenNumbers("SpO2 94% today")).toContain("ninety four percent");
    expect(normalizeSpokenNumbers("creatinine 1.8 mg/dL")).toContain(
      "one point eight milligrams per deciliter",
    );
  });

  it("leaves years and grouped identifiers alone", () => {
    expect(normalizeSpokenNumbers("admitted in 2026")).toBe("admitted in 2026");
    expect(normalizeSpokenNumbers("UHID-2026-8801")).toBe("UHID-2026-8801");
  });

  it("softens report-speak into colleague-speak", () => {
    expect(softenClinicalPhrasing("Administer the drug")).toBe("Give the drug");
    expect(softenClinicalPhrasing("The patient presents with fever")).toBe(
      "The patient has come in with fever",
    );
    expect(softenClinicalPhrasing("Therefore we monitor hourly")).toBe("So we keep an eye on hourly");
  });
});

describe("speechHumanizer — lists become conversation", () => {
  it("speaks a numbered list as First / Then / Finally", () => {
    const out = speakListsAsFlow("1. Start IV fluids\n2. Send CBC\n3. Reassess in one hour");
    expect(out).toContain("First, start IV fluids");
    expect(out).toContain("Then, send CBC");
    expect(out).toContain("Finally, reassess in one hour");
    // The bare numbering must be gone — a machine would read it aloud.
    expect(out).not.toMatch(/\b1\./);
  });
});

describe("speechHumanizer — full pipeline", () => {
  it("turns a markdown clinical dump into one natural spoken turn", () => {
    const raw = [
      "## Sepsis alert 🚨",
      "The patient presents with BP 88/54 and HR 122.",
      "1. Administer IV fluids STAT",
      "2. Obtain CBC and CRP",
      "3. Monitor urine output",
      "As an AI assistant I recommend escalation.",
    ].join("\n");
    const spoken = humanizeConversation(raw);

    expect(spoken).not.toMatch(/[#*`|]/);
    expect(spoken).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(spoken).not.toMatch(/As an AI/);
    expect(spoken).toContain("blood pressure");
    expect(spoken).toContain("heart rate");
    expect(spoken).toContain("intravenous");
    expect(spoken).toContain("complete blood count");
    expect(spoken).toContain("immediately");
    expect(spoken).toMatch(/First|Then|Finally/);
  });

  it("keeps negations and values intact (clinical safety)", () => {
    const spoken = humanizeConversation("No fever. Denies chest pain. Troponin 0.02 ng/mL.");
    expect(spoken).toContain("No fever");
    expect(spoken).toContain("Denies chest pain");
    expect(spoken).toContain("zero point zero two");
  });

  it("honours opener / acknowledgement and never throws on bad input", () => {
    const withIntro = humanizeConversation("Bed 4 is stable.", {
      opener: "Good morning doctor.",
      acknowledgement: "Here is the update.",
    });
    expect(withIntro.startsWith("Good morning doctor. Here is the update.")).toBe(true);
    expect(humanizeConversation("")).toBe("");
    expect(humanizeConversation(undefined as unknown as string)).toBe("");
  });
});


describe("speechHumanizer — breath groups (human pacing)", () => {
  it("gives every group a pause except the last (a turn ends, it does not trail off)", () => {
    const groups = toBreathGroups("Start fluids. Recheck the BP in 15 minutes. Notify me.");
    expect(groups.length).toBe(3);
    expect(groups[0].pauseAfterMs).toBeGreaterThan(0);
    expect(groups[1].pauseAfterMs).toBeGreaterThan(0);
    expect(groups[groups.length - 1].pauseAfterMs).toBe(0);
  });

  it("breaks runaway sentences into breath-sized pieces", () => {
    const long =
      "The patient has come in with fever and hypotension and tachycardia and raised lactate and " +
      "the family has been counselled and the antibiotics have been started and the repeat labs are pending";
    const groups = toBreathGroups(long, { maxChars: 90 });
    expect(groups.length).toBeGreaterThan(1);
    for (const g of groups) expect(g.text.length).toBeLessThanOrEqual(95);
  });

  it("pauses longer before a critical statement than a routine one", () => {
    const routine = toBreathGroups("The bed is clean.");
    const critical = toBreathGroups("This is critical.");
    expect(critical[0].pauseAfterMs).toBeGreaterThanOrEqual(routine[0].pauseAfterMs);
  });

  it("returns nothing for empty input", () => {
    expect(toBreathGroups("")).toEqual([]);
    expect(toBreathGroups("   ")).toEqual([]);
  });
});

describe("speechHumanizer — real silence in the audio", () => {
  it("reads the real Voicebox clip format (24 kHz mono 16-bit PCM)", () => {
    const fmt = readWavFormat(makeWav(0.5));
    expect(fmt).toEqual({ channels: 1, sampleRate: 24000, bitsPerSample: 16 });
  });

  it("rejects non-PCM input so pacing can never corrupt a clip", () => {
    expect(readWavFormat(Buffer.from("not a wav at all"))).toBeNull();
    const mp3ish = Buffer.alloc(100, 0xff);
    expect(readWavFormat(mp3ish)).toBeNull();
  });

  it("builds valid silence of the requested length", () => {
    const sil = wavSilence(250, { channels: 1, sampleRate: 24000, bitsPerSample: 16 });
    expect(sil.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wavSeconds(sil)).toBeCloseTo(0.25, 2);
  });

  it("appends a pause and keeps the WAV container valid", () => {
    const clip = makeWav(1);
    const out = appendPauseToWav(clip, 300);
    expect(out.toString("ascii", 0, 4)).toBe("RIFF");
    expect(out.length).toBeGreaterThan(clip.length);
    expect(wavSeconds(out)).toBeCloseTo(1.3, 2);
    // Both the data-chunk size and the RIFF size must be consistent.
    expect(out.readUInt32LE(40)).toBe(out.length - 44);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });

  it("is a no-op for zero pause or non-WAV input", () => {
    const clip = makeWav(0.2);
    expect(appendPauseToWav(clip, 0)).toBe(clip);
    const notWav = Buffer.alloc(120, 0x11);
    expect(appendPauseToWav(notWav, 200)).toBe(notWav);
  });
});

describe("speechHumanizer — human voice selection", () => {
  const live: VoiceboxProfileInfo[] = [
    { name: "JARVIS", language: "en", description: "British Intelligent AI Voice (Jarvis)" },
    { name: "ASTRA Hindi", language: "hi", description: "Lightweight local Astra Hindi voice" },
    { name: "ASTRA English", language: "en", description: "Lightweight local Astra English voice" },
  ];

  it("flags the JARVIS AI persona as synthetic", () => {
    expect(ROBOT_PERSONA_RE.test("JARVIS")).toBe(true);
    expect(ROBOT_PERSONA_RE.test("British Intelligent AI Voice (Jarvis)")).toBe(true);
    expect(ROBOT_PERSONA_RE.test("ASTRA English")).toBe(false);
  });

  it("never picks the robot persona when a human voice exists", () => {
    const pick = pickHumanProfile(live, "en-IN");
    expect(pick?.name).not.toBe("JARVIS");
    expect(pick?.name).toBe("ASTRA English");
    expect(pick?.natural).toBe(true);
  });

  it("matches the requested language", () => {
    const pick = pickHumanProfile(live, "hi-IN");
    expect(pick?.name).toBe("ASTRA Hindi");
    expect(pick?.matched).toBe(true);
  });

  it("respects an explicit operator pin", () => {
    const pick = pickHumanProfile(live, "en-IN", "JARVIS");
    expect(pick?.name).toBe("JARVIS");
    expect(pick?.reason).toBe("pinned by configuration");
  });

  it("admits honestly when only synthetic personas are installed", () => {
    const onlyRobot: VoiceboxProfileInfo[] = [{ name: "JARVIS", language: "en" }];
    const pick = pickHumanProfile(onlyRobot, "en-IN");
    expect(pick?.natural).toBe(false);
    expect(pick?.reason).toMatch(/synthetic/i);
  });

  it("returns null when no profiles are installed", () => {
    expect(pickHumanProfile([], "en-IN")).toBeNull();
  });
});

