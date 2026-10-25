/**
 * ASTRA 7D — MEDICAL PRONUNCIATION DICTIONARY
 * ============================================================================
 * Clinical terms that should be pronounced correctly by TTS.
 * Maps difficult medical terms to phonetic spellings for better voice delivery.
 */

export interface PronunciationEntry {
  term: string;
  language: string;
  phonetic: string;
  stress?: string;
}

/**
 * Common Indian medical terms with pronunciation guidance.
 */
export const MEDICAL_PRONUNCIATION: Record<string, PronunciationEntry[]> = {
  "en-IN": [
    { term: "CBC", language: "en-IN", phonetic: "C B C", stress: "S-S-S" },
    { term: "Hb", language: "en-IN", phonetic: "H B", stress: "S-S" },
    { term: "HbA1c", language: "en-IN", phonetic: "H B A one C", stress: "S-S-S" },
    { term: "creatinine", language: "en-IN", phonetic: "creh-AT-ih-neen", stress: "S-SS-S" },
    { term: "glucose", language: "en-IN", phonetic: "GLOO-kohss", stress: "SSS-SSS" },
    { term: "diabetes", language: "en-IN", phonetic: "dy-uh-BEE-teez", stress: "SS-SS-SSS" },
    { term: "hypertension", language: "en-IN", phonetic: "hy-per-TEN-shun", stress: "SS-SS-SSS" },
    { term: "insulin", language: "en-IN", phonetic: "IN-suh-lin", stress: "S-SS-S" },
    { term: "metformin", language: "en-IN", phonetic: "met-FOR-min", stress: "S-SS-S" },
    { term: "paracetamol", language: "en-IN", phonetic: "pair-uh-SEE-tuh-mohl", stress: "S-SS-SSS-SSS" },
    { term: "hemoglobin", language: "en-IN", phonetic: "hee-moh-GLOH-bin", stress: "SS-SS-SSS-SSS" },
    { term: "leukocyte", language: "en-IN", phonetic: "LOO-koh-site", stress: "SSS-SS" },
    { term: "echocardiogram", language: "en-IN", phonetic: "ek-oh-KAR-dee-uh-gram", stress: "SS-SS-SSS-SS-SSS" },
    { term: "electrocardiogram", language: "en-IN", phonetic: "ee-lek-troh-KAR-dee-uh-gram", stress: "SS-SS-SS-SSS-SS-SSS" },
    { term: "CT scan", language: "en-IN", phonetic: "C T scan", stress: "S-S SSS" },
    { term: "MRI", language: "en-IN", phonetic: "M R I", stress: "S-S-S" },
    { term: "X-ray", language: "en-IN", phonetic: "EKS-ray", stress: "SS-SS" },
  ],
  "te-IN": [
    { term: "CBC", language: "te-IN", phonetic: "C B C", stress: "S-S-S" },
    { term: "Hb", language: "te-IN", phonetic: "H B", stress: "S-S" },
    { term: "creatinine", language: "te-IN", phonetic: "kreh-uh-tin-een", stress: "S-SS-SS-SSS" },
    { term: "glucose", language: "te-IN", phonetic: "gloo-kohss", stress: "SSS-SSS" },
    { term: "diabetes", language: "te-IN", phonetic: "dy-uh-bee-teez", stress: "SS-SS-SSS" },
    { term: "hypertension", language: "te-IN", phonetic: "hy-per-ten-shun", stress: "SS-SS-SSS" },
    { term: "insulin", language: "te-IN", phonetic: "in-suh-lin", stress: "S-SS-SSS" },
    { term: "metformin", language: "te-IN", phonetic: "met-for-min", stress: "S-SS-SSS" },
  ],
  "hi-IN": [
    { term: "CBC", language: "hi-IN", phonetic: "C B C", stress: "S-S-S" },
    { term: "Hb", language: "hi-IN", phonetic: "H B", stress: "S-S" },
    { term: "creatinine", language: "hi-IN", phonetic: "kreh-uh-tin-een", stress: "S-SS-SS-SSS" },
    { term: "glucose", language: "hi-IN", phonetic: "gloo-kohss", stress: "SSS-SSS" },
    { term: "diabetes", language: "hi-IN", phonetic: "dy-uh-bee-teez", stress: "SS-SS-SSS" },
    { term: "hypertension", language: "hi-IN", phonetic: "hy-per-ten-shun", stress: "SS-SS-SSS" },
    { term: "insulin", language: "hi-IN", phonetic: "in-suh-lin", stress: "S-SS-SSS" },
    { term: "metformin", language: "hi-IN", phonetic: "met-for-min", stress: "S-SS-SSS" },
  ],
};

/**
 * Look up pronunciation for a medical term in a specific language.
 */
export function lookupPronunciation(
  term: string,
  language: string
): PronunciationEntry | undefined {
  const entries = MEDICAL_PRONUNCIATION[language];
  if (!entries) return undefined;

  const exact = entries.find(e => e.term.toLowerCase() === term.toLowerCase());
  if (exact) return exact;

  const prefix = entries.find(e => term.toLowerCase().startsWith(e.term.toLowerCase()));
  if (prefix) return prefix;

  return undefined;
}

/**
 * Get pronunciation for text that may contain clinical terms.
 */
export function getClinicalTermPronunciations(
  text: string,
  language: string
): Array<{ original: string; pronunciation: string }> {
  const results: Array<{ original: string; pronunciation: string }> = [];
  const terms = Object.keys(MEDICAL_PRONUNCIATION[language] || {});

  const lowerText = text.toLowerCase();
  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    if (lowerText.includes(lowerTerm)) {
      const entry = lookupPronunciation(term, language);
      if (entry) {
        results.push({ original: term, pronunciation: entry.phonetic });
      }
    }
  }

  return results;
}
