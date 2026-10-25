export interface LabelledScore {
  confidence: number;
  correct: boolean;
  predicted?: string;
  truth?: string;
  lang?: string;
}

function clampProb(p: number): number {
  return Math.min(1 - 1e-6, Math.max(1e-6, p));
}
function logit(p: number): number {
  const x = clampProb(p);
  return Math.log(x / (1 - x));
}
function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}
export function applyTemperature(confidence: number, temperature: number): number {
  return sigmoid(logit(confidence) / temperature);
}

export function expectedCalibrationError(samples: LabelledScore[], temperature = 1): number {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, conf: 0, acc: 0 }));
  for (const sample of samples) {
    const confidence = temperature === 1 ? sample.confidence : applyTemperature(sample.confidence, temperature);
    const index = Math.min(9, Math.max(0, Math.floor(confidence * 10)));
    bins[index].n += 1;
    bins[index].conf += confidence;
    bins[index].acc += sample.correct ? 1 : 0;
  }
  const total = samples.length || 1;
  let ece = 0;
  for (const bin of bins) {
    if (!bin.n) continue;
    ece += (bin.n / total) * Math.abs(bin.acc / bin.n - bin.conf / bin.n);
  }
  return ece;
}

export function brierScore(samples: LabelledScore[]): number {
  if (!samples.length) return 0;
  return samples.reduce((sum, sample) => {
    const y = sample.correct ? 1 : 0;
    return sum + (sample.confidence - y) ** 2;
  }, 0) / samples.length;
}

export function fitTemperature(samples: LabelledScore[]): number {
  let bestT = 1;
  let best = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 25; step += 1) {
    const temperature = Math.round((0.5 + step * 0.1) * 10) / 10;
    let nll = 0;
    for (const sample of samples) {
      const p = clampProb(applyTemperature(sample.confidence, temperature));
      const y = sample.correct ? 1 : 0;
      nll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    }
    if (nll < best) {
      best = nll;
      bestT = temperature;
    }
  }
  return bestT;
}

export function topConfusions(samples: LabelledScore[], n = 5): Array<{ predicted: string; truth: string; count: number; langs: string[] }> {
  const pairs = new Map<string, { predicted: string; truth: string; count: number; langs: string[] }>();
  for (const sample of samples) {
    if (!sample.predicted || !sample.truth || sample.predicted === sample.truth) continue;
    const key = sample.predicted + "->" + sample.truth;
    const row = pairs.get(key) ?? { predicted: sample.predicted, truth: sample.truth, count: 0, langs: [] };
    row.count += 1;
    if (sample.lang && !row.langs.includes(sample.lang)) row.langs.push(sample.lang);
    pairs.set(key, row);
  }
  return [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, n);
}

export function reliabilityTable(samples: LabelledScore[]): Array<{ bin: number; n: number; confidence: number; accuracy: number }> {
  const bins = Array.from({ length: 10 }, (_, bin) => ({ bin, n: 0, confidence: 0, accuracy: 0 }));
  for (const sample of samples) {
    const index = Math.min(9, Math.max(0, Math.floor(sample.confidence * 10)));
    bins[index].n += 1;
    bins[index].confidence += sample.confidence;
    bins[index].accuracy += sample.correct ? 1 : 0;
  }
  return bins.map((bin) => ({
    bin: bin.bin,
    n: bin.n,
    confidence: bin.n ? bin.confidence / bin.n : 0,
    accuracy: bin.n ? bin.accuracy / bin.n : 0,
  }));
}
