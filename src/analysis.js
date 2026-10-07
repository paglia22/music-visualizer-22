// Analisi audio offline: tutto viene calcolato una sola volta per l'intero brano,
// così anteprima ed esportazione usano esattamente gli stessi dati (rendering deterministico).

export const ANALYSIS_FPS = 60;
export const BAR_COUNT = 96;
const FFT_SIZE = 2048;
const BAR_MIN_HZ = 40;
const BAR_MAX_HZ = 14000;

const BANDS = {
  sub: [25, 70],
  bass: [25, 160],
  lowmid: [160, 500],
  mid: [500, 2500],
  high: [2500, 10000],
};

function makeFFT(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let j = 0, x = i; j < levels; j++, x >>= 1) r = (r << 1) | (x & 1);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tre = re[l] * cos[k] + im[l] * sin[k];
          const tim = im[l] * cos[k] - re[l] * sin[k];
          re[l] = re[j] - tre;
          im[l] = im[j] - tim;
          re[j] += tre;
          im[j] += tim;
        }
      }
    }
  };
}

function percentile(arr, p, stride = 1) {
  const sample = [];
  for (let i = 0; i < arr.length; i += stride) if (Number.isFinite(arr[i])) sample.push(arr[i]);
  if (!sample.length) return 0;
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor((p / 100) * sample.length))];
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

/** Picco locale stile librosa: massimo nella finestra e sopra la media mobile + delta. */
function pickPeaks(x, { pre, post, avgPre, avgPost, delta, wait }) {
  const peaks = [];
  let last = -Infinity;
  for (let n = 0; n < x.length; n++) {
    const v = x[n];
    let isMax = true;
    for (let k = Math.max(0, n - pre); k <= Math.min(x.length - 1, n + post); k++) {
      if (x[k] > v) { isMax = false; break; }
    }
    if (!isMax) continue;
    let sum = 0, cnt = 0;
    for (let k = Math.max(0, n - avgPre); k <= Math.min(x.length - 1, n + avgPost); k++) { sum += x[k]; cnt++; }
    if (v < sum / cnt + delta) continue;
    if (n - last < wait) continue;
    peaks.push(n);
    last = n;
  }
  return peaks;
}

function estimateTempo(onset, fps) {
  const n = onset.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onset[i];
  mean /= n;
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = onset[i] - mean;

  const minLag = Math.floor((60 / 190) * fps);
  const maxLag = Math.ceil((60 / 65) * fps);
  const ac = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += o[i] * o[i + lag];
    ac[lag] = s;
  }
  let best = -Infinity, bestLag = Math.round((60 / 120) * fps);
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120), 2));
    const v = ac[lag] * w;
    if (v > best) { best = v; bestLag = lag; }
  }
  // Rifinitura parabolica per un periodo frazionario.
  const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  return bestLag + shift; // periodo in frame
}

/** Beat tracking a programmazione dinamica (Ellis 2007). */
function trackBeats(onset, period) {
  const n = onset.length;
  let sd = 0, m = 0;
  for (let i = 0; i < n; i++) m += onset[i];
  m /= n;
  for (let i = 0; i < n; i++) sd += (onset[i] - m) ** 2;
  sd = Math.sqrt(sd / n) || 1;
  const local = new Float32Array(n);
  for (let i = 0; i < n; i++) local[i] = onset[i] / sd;

  const tight = 100;
  const score = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - Math.round(2 * period));
    const hi = i - Math.round(period / 2);
    let best = -Infinity, arg = -1;
    for (let j = lo; j <= hi; j++) {
      const pen = Math.log((i - j) / period);
      const v = score[j] - tight * pen * pen;
      if (v > best) { best = v; arg = j; }
    }
    if (arg >= 0 && best > 0) {
      score[i] = local[i] + best;
      back[i] = arg;
    } else {
      score[i] = local[i];
    }
  }
  // Ultimo beat: l'ultimo massimo locale "forte" del punteggio cumulativo.
  const maxima = [];
  for (let i = 1; i < n - 1; i++) if (score[i] > score[i - 1] && score[i] >= score[i + 1]) maxima.push(i);
  if (!maxima.length) return [];
  const med = percentile(maxima.map((i) => score[i]), 50);
  let lastBeat = maxima[maxima.length - 1];
  for (let k = maxima.length - 1; k >= 0; k--) {
    if (score[maxima[k]] > 0.5 * med) { lastBeat = maxima[k]; break; }
  }
  const beats = [];
  for (let i = lastBeat; i >= 0; i = back[i]) beats.push(i);
  beats.reverse();
  return beats;
}

/**
 * Analizza l'AudioBuffer e restituisce le feature grezze per frame.
 * onProgress(0..1) viene chiamato durante il calcolo.
 */
export async function analyzeAudio(audioBuffer, onProgress = () => {}) {
  const fps = ANALYSIS_FPS;
  const sr = audioBuffer.sampleRate;
  const len = audioBuffer.length;
  const duration = audioBuffer.duration;

  const mono = new Float32Array(len);
  const chs = Math.min(audioBuffer.numberOfChannels, 2);
  for (let c = 0; c < chs; c++) {
    const d = audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / chs;
  }

  const nFrames = Math.ceil(duration * fps) + 1;
  const fft = makeFFT(FFT_SIZE);
  const half = FFT_SIZE / 2;
  const binHz = sr / FFT_SIZE;
  const win = new Float32Array(FFT_SIZE);
  let winSum = 0;
  for (let i = 0; i < FFT_SIZE; i++) {
    win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
    winSum += win[i];
  }
  const magScale = 2 / winSum;

  // Mappatura logaritmica bin -> barre.
  const barLo = new Float32Array(BAR_COUNT), barHi = new Float32Array(BAR_COUNT);
  for (let b = 0; b < BAR_COUNT; b++) {
    barLo[b] = (BAR_MIN_HZ * Math.pow(BAR_MAX_HZ / BAR_MIN_HZ, b / BAR_COUNT)) / binHz;
    barHi[b] = (BAR_MIN_HZ * Math.pow(BAR_MAX_HZ / BAR_MIN_HZ, (b + 1) / BAR_COUNT)) / binHz;
  }
  const bandBins = {};
  for (const [k, [lo, hi]] of Object.entries(BANDS)) {
    bandBins[k] = [Math.max(1, Math.floor(lo / binHz)), Math.min(half - 1, Math.ceil(hi / binHz))];
  }
  const lowFluxBins = [1, Math.ceil(170 / binHz)];
  const hiFluxBins = [Math.floor(1800 / binHz), Math.ceil(10000 / binHz)];
  const fullFluxBins = [1, Math.ceil(10000 / binHz)];

  const barsDb = new Float32Array(nFrames * BAR_COUNT);
  const bandDb = {};
  for (const k of Object.keys(BANDS)) bandDb[k] = new Float32Array(nFrames);
  const rms = new Float32Array(nFrames);
  const lowFlux = new Float32Array(nFrames);
  const hiFlux = new Float32Array(nFrames);
  const fullFlux = new Float32Array(nFrames);

  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const mag = new Float32Array(half);
  const logMag = new Float32Array(half);
  const prevLog = new Float32Array(half);
  const hop = sr / fps;

  for (let f = 0; f < nFrames; f++) {
    const center = Math.round(f * hop);
    const start = center - half;
    let sq = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = start + i;
      const s = idx >= 0 && idx < len ? mono[idx] : 0;
      re[i] = s * win[i];
      im[i] = 0;
    }
    const r0 = Math.max(0, center - Math.round(hop / 2));
    const r1 = Math.min(len, center + Math.round(hop / 2));
    for (let i = r0; i < r1; i++) sq += mono[i] * mono[i];
    rms[f] = Math.sqrt(sq / Math.max(1, r1 - r0));

    fft(re, im);
    for (let k = 0; k < half; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]) * magScale;
      mag[k] = m;
      logMag[k] = Math.log(1 + 1000 * m);
    }

    for (let b = 0; b < BAR_COUNT; b++) {
      const lo = barLo[b], hi = barHi[b];
      let v;
      if (hi - lo < 1) {
        const c = (lo + hi) / 2;
        const k0 = Math.floor(c), fr = c - k0;
        v = mag[k0] * (1 - fr) + mag[Math.min(half - 1, k0 + 1)] * fr;
      } else {
        v = 0;
        for (let k = Math.ceil(lo); k <= Math.min(half - 1, Math.floor(hi)); k++) if (mag[k] > v) v = mag[k];
      }
      barsDb[f * BAR_COUNT + b] = 20 * Math.log10(v + 1e-9);
    }

    for (const k in bandBins) {
      const [a, z] = bandBins[k];
      let e = 0;
      for (let i = a; i <= z; i++) e += mag[i] * mag[i];
      bandDb[k][f] = 10 * Math.log10(e + 1e-12);
    }

    if (f > 0) {
      let lf = 0, hf = 0, ff = 0;
      for (let k = lowFluxBins[0]; k <= lowFluxBins[1]; k++) lf += Math.max(0, logMag[k] - prevLog[k]);
      for (let k = hiFluxBins[0]; k <= hiFluxBins[1]; k++) hf += Math.max(0, logMag[k] - prevLog[k]);
      for (let k = fullFluxBins[0]; k <= fullFluxBins[1]; k++) ff += Math.max(0, logMag[k] - prevLog[k]);
      lowFlux[f] = lf;
      hiFlux[f] = hf;
      fullFlux[f] = ff;
    }
    prevLog.set(logMag);

    if (f % 400 === 0) {
      onProgress(0.85 * (f / nFrames));
      await yieldToUI();
    }
  }

  // Normalizzazione barre: riferimento misto globale / per barra, così anche gli acuti si vedono.
  const globalRef = percentile(barsDb, 99.5, 7);
  const bars = new Float32Array(nFrames * BAR_COUNT);
  const RANGE = 40;
  const col = new Float32Array(nFrames);
  for (let b = 0; b < BAR_COUNT; b++) {
    for (let f = 0; f < nFrames; f++) col[f] = barsDb[f * BAR_COUNT + b];
    const ref = 0.55 * globalRef + 0.45 * percentile(col, 99, 3);
    for (let f = 0; f < nFrames; f++) {
      const v = clamp01((col[f] - (ref - RANGE)) / RANGE);
      bars[f * BAR_COUNT + b] = v * v * (3 - 2 * v) * 0.35 + v * 0.65;
    }
  }
  onProgress(0.9);
  await yieldToUI();

  const bands = {};
  for (const k of Object.keys(BANDS)) {
    const top = percentile(bandDb[k], 98, 3);
    const out = new Float32Array(nFrames);
    for (let f = 0; f < nFrames; f++) out[f] = clamp01((bandDb[k][f] - (top - 26)) / 26);
    bands[k] = out;
  }

  // Rilevamento colpi (cassa) e accenti (rullante/hi-hat).
  const norm = (x) => {
    const p = percentile(x, 95, 2) || 1;
    const o = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) o[i] = x[i] / p;
    return o;
  };
  const lowN = norm(lowFlux), hiN = norm(hiFlux), fullN = norm(fullFlux);
  onProgress(0.95);
  await yieldToUI();

  // Tempo e griglia dei beat.
  const onset = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) onset[i] = 0.6 * fullN[i] + 0.4 * lowN[i];
  const period = estimateTempo(onset, fps);
  const bpm = (60 * fps) / period;
  const rmsTop = percentile(rms, 95, 3) || 1;
  const beats = trackBeats(onset, period)
    .filter((i) => rms[i] > rmsTop * 0.06)
    .map((i) => i / fps);

  onProgress(1);
  const A = { fps, nFrames, duration, sampleRate: sr, mono, bars, bands, rms, rmsTop, lowN, hiN, beats, bpm };
  Object.assign(A, detectEvents(A, 0.5));
  return A;
}

/**
 * Colpi di cassa e accenti acuti. sensitivity 0..1: più alta = più colpi rilevati.
 * Veloce: si può ricalcolare quando l'utente sposta lo slider.
 */
export function detectEvents(A, sensitivity = 0.5) {
  const { fps, nFrames, lowN, hiN, bands } = A;
  const lerp = (a, b) => a + (b - a) * sensitivity;
  const peakOpts = { pre: 5, post: 5, avgPre: 24, avgPost: 6, wait: Math.round(lerp(0.15, 0.08) * fps) };
  // Il flusso è logaritmico (sente il ritmo anche nelle parti piano): la forza del colpo
  // viene pesata col livello reale della banda, così i drop colpiscono più delle strofe.
  const levelNear = (x, i) => Math.max(x[i], x[Math.min(nFrames - 1, i + 1)], x[Math.min(nFrames - 1, i + 3)]);
  const minS = lerp(0.14, 0.04);
  const kicks = pickPeaks(lowN, { ...peakOpts, delta: lerp(0.55, 0.12) })
    .filter((i) => lowN[i] > lerp(0.6, 0.15))
    .map((i) => ({ t: i / fps, s: clamp01(lowN[i] / 1.3) * (0.3 + 0.7 * levelNear(bands.bass, i)) }))
    .filter((k) => k.s > minS);
  const hits = pickPeaks(hiN, { ...peakOpts, delta: lerp(0.5, 0.12) })
    .filter((i) => hiN[i] > lerp(0.65, 0.2))
    .map((i) => ({ t: i / fps, s: clamp01(hiN[i] / 1.4) * (0.3 + 0.7 * levelNear(bands.high, i)) }))
    .filter((k) => k.s > minS);
  return { kicks, hits };
}

/**
 * Inviluppi attacco/rilascio + impulsi: è qui che si decide quanto la grafica "segue" il ritmo.
 * Veloce da ricalcolare quando cambia la morbidezza.
 */
export function buildEnvelopes(A, { smoothing = 0.5 } = {}) {
  const { nFrames: n, fps } = A;
  const attack = 0.8;
  const release = 0.72 + 0.22 * smoothing; // quota trattenuta per frame

  const bars = new Float32Array(A.bars.length);
  const prev = new Float32Array(BAR_COUNT);
  for (let f = 0; f < n; f++) {
    const o = f * BAR_COUNT;
    for (let b = 0; b < BAR_COUNT; b++) {
      const x = A.bars[o + b];
      const e = prev[b];
      const v = x > e ? e + (x - e) * attack : e * release + x * (1 - release);
      bars[o + b] = v;
      prev[b] = v;
    }
  }

  const follow = (x, att, rel) => {
    const out = new Float32Array(n);
    let e = 0;
    for (let i = 0; i < n; i++) {
      e = x[i] > e ? e + (x[i] - e) * att : e * rel + x[i] * (1 - rel);
      out[i] = e;
    }
    return out;
  };
  const bandRel = 0.8 + 0.15 * smoothing;
  const env = {
    bars,
    sub: follow(A.bands.sub, 0.85, bandRel),
    bass: follow(A.bands.bass, 0.85, bandRel),
    lowmid: follow(A.bands.lowmid, 0.7, bandRel),
    mid: follow(A.bands.mid, 0.7, bandRel),
    high: follow(A.bands.high, 0.7, bandRel),
  };

  const impulses = (events, tau, weight = 1) => {
    const imp = new Float32Array(n);
    for (const e of events) {
      const i = Math.round(e.t * fps);
      if (i < n) imp[i] = Math.max(imp[i], e.s * weight);
    }
    const out = new Float32Array(n);
    const decay = Math.exp(-1 / (fps * tau));
    let v = 0;
    for (let i = 0; i < n; i++) {
      v = Math.max(v * decay, imp[i]);
      out[i] = v;
    }
    return out;
  };
  const tauScale = 0.75 + 0.5 * smoothing;
  env.pulse = impulses(A.kicks, 0.17 * tauScale);
  const kickFlash = impulses(A.kicks, 0.07 * tauScale);
  const hitFlash = impulses(A.hits, 0.06 * tauScale, 0.55);
  env.flash = new Float32Array(n);
  for (let i = 0; i < n; i++) env.flash[i] = Math.max(kickFlash[i], hitFlash[i]);

  // Energia della sezione (strofa tranquilla vs ritornello): media mobile centrata di ~1.5 s.
  const w = Math.round(0.75 * fps);
  const energy = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < Math.min(n, w); i++) acc += A.rms[i];
  for (let i = 0; i < n; i++) {
    if (i + w < n) acc += A.rms[i + w];
    if (i - w - 1 >= 0) acc -= A.rms[i - w - 1];
    const cnt = Math.min(n - 1, i + w) - Math.max(0, i - w) + 1;
    energy[i] = acc / cnt;
  }
  const lo = percentile(energy, 10, 3), hi = percentile(energy, 97, 3) || 1;
  for (let i = 0; i < n; i++) energy[i] = clamp01((energy[i] - lo) / Math.max(1e-6, hi - lo));
  env.energy = energy;

  // Rotazione cumulativa: gira più veloce nelle parti cariche.
  const rot = new Float32Array(n);
  for (let i = 1; i < n; i++) rot[i] = rot[i - 1] + (0.05 + 0.45 * energy[i] * energy[i] + 0.25 * env.pulse[i]) / fps;
  env.rot = rot;
  return env;
}

/** Indice dell'ultimo elemento con .t (o valore) <= t, -1 se nessuno. */
export function lastIndexAtOrBefore(arr, t, key = null) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = key ? arr[mid][key] : arr[mid];
    if (v <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
