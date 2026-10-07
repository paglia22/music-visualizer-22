// Testo della canzone in formato LRC: "[mm:ss.xx] riga".

const TS = /\[(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)\]/g;
const TAG = /^\s*\[([a-z]+):(.*)\]\s*$/i; // [ti:...], [ar:...]
const SECTION = /^\s*\[[^\]\d][^\]]*\]\s*$/; // [Verse 1], [Chorus] (tag di sezione stile Suno)

/** Righe sincronizzate, ordinate: [{t, text}]. Le righe vuote fanno sparire il testo. */
export function parseLyrics(src) {
  const lines = [];
  const meta = {};
  for (const raw of src.split(/\r?\n/)) {
    const tag = raw.match(TAG);
    if (tag && !/^\d/.test(tag[1])) {
      meta[tag[1].toLowerCase()] = tag[2].trim();
      continue;
    }
    const stamps = [...raw.matchAll(TS)];
    if (!stamps.length) continue;
    const text = raw.replace(TS, '').trim();
    for (const m of stamps) lines.push({ t: Number(m[1]) * 60 + Number(m[2].replace(',', '.')), text });
  }
  lines.sort((a, b) => a.t - b.t);
  return { lines, meta };
}

/** Righe da sincronizzare: toglie timestamp, tag di sezione e righe vuote. */
export function plainLines(src) {
  return src
    .split(/\r?\n/)
    .filter((l) => !TAG.test(l) || /^\s*\[\d/.test(l))
    .map((l) => l.replace(TS, '').trim())
    .filter((l) => l && !SECTION.test(l));
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

export function toLRC(lines) {
  return lines.map((l) => `[${formatTime(l.t)}] ${l.text}`.trimEnd()).join('\n');
}

export function hasTimestamps(src) {
  return /\[\d{1,2}:\d{1,2}/.test(src);
}
