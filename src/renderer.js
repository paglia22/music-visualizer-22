import { BAR_COUNT, lastIndexAtOrBefore } from './analysis.js';

// Il rendering è "senza stato": ogni fotogramma dipende solo dal tempo t.
// Così si può saltare in qualsiasi punto e l'esportazione coincide con l'anteprima.

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Compressione morbida: sopra 0.75 si avvicina a 1 senza appiattirsi.
const softClip = (x) => (x <= 0.75 ? Math.max(0, x) : 0.75 + 0.25 * Math.tanh((x - 0.75) / 0.25));
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
const rand = (seed) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class Renderer {
  constructor() {
    this.size = [0, 0];
    this.cover = null;
    this.background = null;
    this.bgCache = null;
    this.colorKey = '';
  }

  setImages({ cover, background }) {
    if (cover !== undefined) this.cover = cover;
    if (background !== undefined) {
      this.background = background;
      this.bgCache = null;
    }
  }

  ensureLayers(w, h) {
    if (this.size[0] === w && this.size[1] === h) return;
    this.size = [w, h];
    this.fg = makeCanvas(w, h);
    this.fgc = this.fg.getContext('2d');
    this.glow1 = makeCanvas(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4)));
    this.glow1c = this.glow1.getContext('2d');
    this.glow2 = makeCanvas(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 12)));
    this.glow2c = this.glow2.getContext('2d');
    this.canFilter = typeof this.glow1c.filter === 'string';
    this.bgCache = null;
  }

  prepareColors(S) {
    const key = S.colorA + S.colorB + S.colorBg;
    if (key === this.colorKey) return;
    this.colorKey = key;
    this.cA = hexToRgb(S.colorA);
    this.cB = hexToRgb(S.colorB);
    this.cBg = hexToRgb(S.colorBg);
    this.barColors = [];
    for (let b = 0; b < BAR_COUNT; b++) this.barColors.push(mix(this.cA, this.cB, Math.pow(b / (BAR_COUNT - 1), 0.8)));
  }

  layout(w, h, S, hasLyrics) {
    const u = Math.min(w, h) / 1080;
    const portrait = h > w * 1.2;
    const square = !portrait && w < h * 1.2;
    const L = { u, w, h, portrait, square, cx: w / 2 };
    if (S.style === 'orbit') {
      if (portrait) Object.assign(L, { cy: h * 0.42, ringR: 185 * u, barLen: 205 * u });
      else if (square) Object.assign(L, { cy: h * (hasLyrics ? 0.44 : 0.5), ringR: 125 * u, barLen: 150 * u });
      else Object.assign(L, { cy: h * (hasLyrics ? 0.45 : 0.5), ringR: 135 * u, barLen: 160 * u });
    } else {
      if (portrait) Object.assign(L, { cy: h * 0.42, spanW: w * 0.9, maxH: h * 0.13, perSide: 34 });
      else if (square) Object.assign(L, { cy: h * (hasLyrics ? 0.45 : 0.5), spanW: w * 0.86, maxH: h * 0.2, perSide: 40 });
      else Object.assign(L, { cy: h * (hasLyrics ? 0.46 : 0.5), spanW: w * 0.82, maxH: h * 0.24, perSide: 64 });
    }
    L.lyricY = portrait ? h * 0.72 : h * (S.style === 'orbit' ? 0.885 : 0.84);
    L.lyricSize = (portrait ? 62 : square ? 50 : 52) * u * S.lyricsSize;
    L.lyricMaxW = w * (portrait ? 0.84 : 0.7);
    return L;
  }

  /** Disegna il fotogramma al tempo t sul contesto ctx (dimensioni w×h). */
  render(ctx, w, h, t, A, E, S, lyrics) {
    this.ensureLayers(w, h);
    this.prepareColors(S);
    const hasLyrics = S.showLyrics && lyrics && lyrics.length > 0;
    const L = this.layout(w, h, S, hasLyrics);
    const i = A ? Math.max(0, Math.min(A.nFrames - 1, Math.round(t * A.fps))) : 0;
    const F = A
      ? {
          i, t,
          bass: E.bass[i], sub: E.sub[i], mid: E.mid[i], high: E.high[i],
          pulse: E.pulse[i], flash: E.flash[i], energy: E.energy[i], rot: E.rot[i],
          react: S.reactivity,
        }
      : { i: 0, t, bass: 0, sub: 0, mid: 0, high: 0, pulse: 0, flash: 0, energy: 0, rot: 0, react: S.reactivity };

    this.drawBackground(ctx, L, F, S);

    const g = this.fgc;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // "Punch" della camera sulla cassa.
    const zoom = 1 + 0.022 * F.pulse * F.react + 0.01 * F.bass;
    g.translate(L.cx, L.cy);
    g.scale(zoom, zoom);
    g.translate(-L.cx, -L.cy);

    if (A) {
      if (S.style === 'orbit') this.drawOrbit(g, L, F, A, E, S);
      else if (S.style === 'horizon') this.drawHorizon(g, L, F, A, E, S);
      else this.drawWave(g, L, F, A, E, S);
    } else {
      this.drawIdle(g, L, t);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.fg, 0, 0);
    this.drawBloom(ctx, L, F, S);
    this.drawVignette(ctx, L);
    this.drawOverlay(ctx, L, F, A, S, lyrics, hasLyrics);
  }

  drawBackground(ctx, L, F, S) {
    const { w, h, u } = L;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = rgba(this.cBg, 1);
    ctx.fillRect(0, 0, w, h);

    if (this.background) {
      if (!this.bgCache) this.bgCache = this.buildBackground(w, h, u);
      const z = 1.04 + 0.025 * F.pulse * F.react + 0.02 * F.energy;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(z, z);
      ctx.globalAlpha = 0.55 + 0.25 * F.energy;
      ctx.drawImage(this.bgCache, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // Alone centrale che respira con i bassi.
    const r = Math.max(w, h) * (0.55 + 0.1 * F.bass);
    const grad = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, r);
    const a = 0.05 + 0.13 * F.bass * F.react + 0.07 * F.energy;
    grad.addColorStop(0, rgba(this.cA, a));
    grad.addColorStop(0.45, rgba(mix(this.cA, this.cB, 0.5), a * 0.35));
    grad.addColorStop(1, rgba(this.cBg, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  buildBackground(w, h, u) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const img = this.background;
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    if (typeof g.filter === 'string') g.filter = `blur(${Math.round(28 * u)}px)`;
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    g.filter = 'none';
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, 0, w, h);
    return c;
  }

  drawVignette(ctx, L) {
    const { w, h } = L;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  drawBloom(ctx, L, F, S) {
    const strength = S.bloom * (0.55 + 0.35 * F.energy + 0.5 * F.flash);
    if (strength <= 0.01) return;
    const { w, h } = L;
    const g1 = this.glow1c, g2 = this.glow2c;
    const w1 = this.glow1.width, h1 = this.glow1.height;
    const w2 = this.glow2.width, h2 = this.glow2.height;
    g1.globalCompositeOperation = 'copy';
    if (this.canFilter) g1.filter = `blur(${Math.max(1, w1 / 320).toFixed(1)}px)`;
    g1.drawImage(this.fg, 0, 0, w1, h1);
    g1.filter = 'none';
    g2.globalCompositeOperation = 'copy';
    if (this.canFilter) g2.filter = `blur(${Math.max(1, w2 / 110).toFixed(1)}px)`;
    g2.drawImage(this.glow1, 0, 0, w2, h2);
    g2.filter = 'none';

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = Math.min(1, 0.75 * strength);
    ctx.drawImage(this.glow1, 0, 0, w, h);
    ctx.globalAlpha = Math.min(1, 0.9 * strength);
    ctx.drawImage(this.glow2, 0, 0, w, h);
    ctx.restore();
  }

  // ---------- Elementi condivisi ----------

  beatTick(A, t) {
    const j = lastIndexAtOrBefore(A.beats, t);
    if (j < 0) return 0;
    const next = A.beats[j + 1] ?? A.beats[j] + 60 / A.bpm;
    const phase = clamp01((t - A.beats[j]) / Math.max(0.2, (next - A.beats[j]) * 0.45));
    return j + easeOutCubic(phase);
  }

  waveform(A, t, points, span = 2048) {
    const out = new Float32Array(points);
    const c = Math.round(t * A.sampleRate);
    const start = c - span / 2;
    for (let k = 0; k < points; k++) {
      const a = start + Math.floor((k / points) * span);
      const b = start + Math.floor(((k + 1) / points) * span);
      let v = 0;
      for (let s = a; s < b; s++) {
        const x = s >= 0 && s < A.mono.length ? A.mono[s] : 0;
        if (Math.abs(x) > Math.abs(v)) v = x;
      }
      out[k] = v;
    }
    return out;
  }

  /** Polvere ambientale: si muove con la rotazione cumulativa e brilla con gli acuti. */
  drawDust(g, L, F, count, area) {
    const { u, cx, cy } = L;
    const tw = 0.35 + 0.9 * F.high + 0.5 * F.flash;
    for (let k = 0; k < count; k++) {
      const r0 = rand(k * 3.1), r1 = rand(k * 7.7), r2 = rand(k * 1.3), r3 = rand(k * 5.9);
      let x, y;
      if (area === 'radial') {
        const ang = r0 * TAU + F.rot * (0.25 + r1 * 0.6) * (r2 > 0.5 ? 1 : -1);
        const rad = L.ringR * 1.4 + r1 * Math.max(L.w, L.h) * 0.55 + Math.sin(F.t * 0.4 + r3 * 9) * 12 * u;
        x = cx + Math.cos(ang) * rad;
        y = cy + Math.sin(ang) * rad;
      } else {
        x = ((r0 * L.w + F.rot * (20 + 60 * r2) * u) % (L.w + 40 * u)) - 20 * u;
        y = ((r1 * L.h - F.rot * (40 + 90 * r3) * u) % L.h + L.h) % L.h;
      }
      const a = clamp01((0.06 + 0.22 * r3) * tw);
      g.fillStyle = rgba(mix(this.cA, this.cB, r2), a);
      const s = (0.8 + 1.8 * r1) * u;
      g.beginPath();
      g.arc(x, y, s, 0, TAU);
      g.fill();
    }
  }

  /** Scintille che esplodono sui colpi di cassa. */
  drawBursts(g, L, A, F, origin) {
    const life = 1.1;
    const { u } = L;
    const j1 = lastIndexAtOrBefore(A.kicks, F.t, 't');
    for (let j = j1; j >= 0; j--) {
      const k = A.kicks[j];
      const age = F.t - k.t;
      if (age > life) break;
      if (k.s < 0.35) continue;
      const p = age / life;
      const n = Math.round(8 + 14 * k.s * F.react);
      for (let q = 0; q < n; q++) {
        const seed = j * 131 + q * 17;
        const sp = 0.35 + 0.65 * rand(seed + 2);
        const d = easeOutQuart(p) * sp * L.burstDist * (0.6 + 0.6 * k.s);
        const [x, y] = origin(seed, d);
        const a = Math.pow(1 - p, 1.6) * (0.4 + 0.6 * k.s);
        g.fillStyle = rgba(mix(this.cA, this.cB, rand(seed + 5)), a);
        g.beginPath();
        g.arc(x, y, (1.1 + 1.6 * rand(seed + 4)) * u * (1 - 0.5 * p), 0, TAU);
        g.fill();
      }
    }
  }

  // ---------- Stile: Orbita ----------

  drawOrbit(g, L, F, A, E, S) {
    const { u, cx, cy } = L;
    const react = F.react;
    const R = L.ringR * (1 + 0.075 * F.bass * react + 0.07 * F.pulse * react);
    const gap = 10 * u;
    const off = F.i * BAR_COUNT;
    L.burstDist = L.barLen * 1.6;

    if (S.particles) this.drawDust(g, L, F, 80, 'radial');

    // Onde concentriche sui colpi di cassa.
    const life = 1.4;
    const maxR = Math.max(L.w, L.h) * 0.62;
    g.lineCap = 'round';
    for (let j = lastIndexAtOrBefore(A.kicks, F.t, 't'); j >= 0; j--) {
      const k = A.kicks[j];
      const age = F.t - k.t;
      if (age > life) break;
      const p = age / life;
      const r = R + easeOutCubic(p) * (maxR - R);
      g.strokeStyle = rgba(this.cA, Math.pow(1 - p, 2) * k.s * 0.5 * Math.min(1.4, react));
      g.lineWidth = (2.4 - 1.6 * p) * u;
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.stroke();
    }

    // Barre radiali, speculari (bassi in alto).
    g.lineWidth = 3.4 * u;
    for (let b = 0; b < BAR_COUNT; b++) {
      const v = softClip(E.bars[off + b] * (0.5 + 0.4 * react));
      const len = 3 * u + Math.pow(v, 1.35) * L.barLen;
      const ang = ((b + 0.5) / BAR_COUNT) * Math.PI;
      g.strokeStyle = rgba(this.barColors[b], 0.3 + 0.7 * v);
      g.beginPath();
      for (const side of [1, -1]) {
        const a = -Math.PI / 2 + side * ang;
        const c = Math.cos(a), s = Math.sin(a);
        g.moveTo(cx + c * (R + gap), cy + s * (R + gap));
        g.lineTo(cx + c * (R + gap + len), cy + s * (R + gap + len));
      }
      g.stroke();
    }

    // Anello di punti che avanza a ogni beat.
    const tickR = L.ringR * 1.16 + L.barLen + 34 * u;
    const dots = 72;
    const tick = this.beatTick(A, F.t);
    const base = (tick * TAU) / dots / 2 - Math.PI / 2;
    for (let d = 0; d < dots; d++) {
      const a = base + (d / dots) * TAU;
      const major = d % 6 === 0;
      g.fillStyle = rgba(major ? this.cA : this.cB, (major ? 0.45 : 0.18) + 0.45 * F.flash);
      g.beginPath();
      g.arc(cx + Math.cos(a) * tickR, cy + Math.sin(a) * tickR, (major ? 2.6 : 1.5) * u, 0, TAU);
      g.fill();
    }

    if (S.particles) this.drawBursts(g, L, A, F, (seed, d) => {
      const a = rand(seed) * TAU;
      return [cx + Math.cos(a) * (R + gap + d), cy + Math.sin(a) * (R + gap + d)];
    });

    // Nucleo: copertina oppure oscilloscopio circolare.
    const inner = R - 8 * u;
    if (this.cover) {
      g.save();
      g.beginPath();
      g.arc(cx, cy, inner, 0, TAU);
      g.clip();
      const img = this.cover;
      const s = ((inner * 2) / Math.min(img.width, img.height)) * (1.02 + 0.04 * F.pulse);
      g.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
      g.fillStyle = `rgba(255,255,255,${0.1 * F.flash})`;
      g.fillRect(cx - inner, cy - inner, inner * 2, inner * 2);
      g.restore();
    } else {
      const core = g.createRadialGradient(cx, cy, 0, cx, cy, inner);
      core.addColorStop(0, rgba(this.cA, 0.1 + 0.25 * F.flash));
      core.addColorStop(1, rgba(this.cA, 0.02));
      g.fillStyle = core;
      g.beginPath();
      g.arc(cx, cy, inner, 0, TAU);
      g.fill();

      const pts = 160;
      const wf = this.waveform(A, F.t, pts, 2400);
      const r0 = inner * 0.55;
      g.beginPath();
      for (let k = 0; k <= pts; k++) {
        const a = (k / pts) * TAU - Math.PI / 2;
        // Raccordo per chiudere la curva senza scalino.
        const edge = Math.min(k, pts - k) / 12;
        const v = wf[k % pts] * Math.min(1, edge);
        const r = r0 + v * inner * 0.36 * (0.7 + 0.4 * react);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.strokeStyle = rgba(this.cB, 0.75);
      g.lineWidth = 2 * u;
      g.lineJoin = 'round';
      g.stroke();
    }

    g.strokeStyle = rgba(mix(this.cA, [255, 255, 255], 0.25 * F.flash), 0.95);
    g.lineWidth = (2.6 + 1.5 * F.flash) * u;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.stroke();
    g.strokeStyle = rgba(this.cB, 0.18);
    g.lineWidth = 1 * u;
    g.beginPath();
    g.arc(cx, cy, R - 14 * u, 0, TAU);
    g.stroke();
  }

  // ---------- Stile: Orizzonte ----------

  sampleBars(E, i, n) {
    const out = new Float32Array(n);
    const off = i * BAR_COUNT;
    const usable = BAR_COUNT - 6;
    for (let j = 0; j < n; j++) {
      const a = Math.floor((j / n) * usable), b = Math.max(a + 1, Math.floor(((j + 1) / n) * usable));
      let v = 0;
      for (let k = a; k < b; k++) v = Math.max(v, E.bars[off + k]);
      out[j] = v;
    }
    return out;
  }

  drawHorizon(g, L, F, A, E, S) {
    const { u, cx, cy } = L;
    const react = F.react;
    const n = L.perSide;
    const half = L.spanW / 2;
    const step = half / n;
    const vals = this.sampleBars(E, F.i, n);
    L.burstDist = L.maxH * 1.5;

    if (S.particles) this.drawDust(g, L, F, 60, 'field');

    // Linee che si allontanano dall'orizzonte sui colpi.
    const life = 1.2;
    for (let j = lastIndexAtOrBefore(A.kicks, F.t, 't'); j >= 0; j--) {
      const k = A.kicks[j];
      const age = F.t - k.t;
      if (age > life) break;
      const p = age / life;
      const dy = easeOutCubic(p) * L.h * 0.45;
      const a = Math.pow(1 - p, 2) * k.s * 0.45 * Math.min(1.4, react);
      for (const sgn of [-1, 1]) {
        const y = cy + sgn * (8 * u + dy);
        const grad = g.createLinearGradient(cx - half, 0, cx + half, 0);
        grad.addColorStop(0, rgba(this.cA, 0));
        grad.addColorStop(0.5, rgba(this.cA, a));
        grad.addColorStop(1, rgba(this.cA, 0));
        g.fillStyle = grad;
        g.fillRect(cx - half, y - 0.8 * u, half * 2, 1.6 * u);
      }
    }

    // Barre: bassi al centro, riflesso attenuato sotto.
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.5 * u, step * 0.48);
    const gap = 6 * u;
    for (let j = 0; j < n; j++) {
      const v = softClip(vals[j] * (0.5 + 0.4 * react));
      const hh = 2 * u + Math.pow(v, 1.3) * L.maxH;
      const col = this.barColors[Math.round((j / n) * (BAR_COUNT - 1))];
      for (const sgn of [-1, 1]) {
        const x = cx + sgn * (j + 0.5) * step;
        g.strokeStyle = rgba(col, 0.35 + 0.65 * v);
        g.beginPath();
        g.moveTo(x, cy - gap);
        g.lineTo(x, cy - gap - hh);
        g.stroke();
        g.strokeStyle = rgba(col, (0.35 + 0.65 * v) * 0.28);
        g.beginPath();
        g.moveTo(x, cy + gap);
        g.lineTo(x, cy + gap + hh * 0.6);
        g.stroke();
      }
    }

    // La linea di luce.
    const lw = L.w * 0.96;
    const grad = g.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
    const la = 0.35 + 0.6 * F.flash;
    grad.addColorStop(0, rgba(this.cB, 0));
    grad.addColorStop(0.5, rgba(mix(this.cB, [255, 255, 255], 0.4 * F.flash), la));
    grad.addColorStop(1, rgba(this.cB, 0));
    g.fillStyle = grad;
    const th = (1.4 + 2.5 * F.pulse * react) * u;
    g.fillRect(cx - lw / 2, cy - th / 2, lw, th);

    if (S.particles) this.drawBursts(g, L, A, F, (seed, d) => {
      const x = cx + (rand(seed) - 0.5) * L.spanW;
      const dir = rand(seed + 9) > 0.5 ? -1 : 1;
      return [x + (rand(seed + 3) - 0.5) * d * 0.4, cy + dir * d];
    });
  }

  // ---------- Stile: Onda ----------

  drawWave(g, L, F, A, E, S) {
    const { u, cx, cy } = L;
    const react = F.react;
    const n = 40;
    const half = L.spanW / 2;
    L.burstDist = L.maxH * 1.4;

    if (S.particles) this.drawDust(g, L, F, 60, 'field');

    const layers = 4;
    for (let layer = layers - 1; layer >= 0; layer--) {
      const fi = Math.max(0, F.i - layer * Math.round(0.07 * A.fps));
      const vals = this.sampleBars(E, fi, n);
      const col = mix(this.cA, this.cB, layer / (layers - 1));
      const fade = 1 - layer / layers;
      const pts = [];
      for (let j = -n; j <= n; j++) {
        const k = Math.abs(j);
        const v = softClip(vals[Math.min(n - 1, k)] * (0.5 + 0.4 * react));
        const taper = Math.sin((1 - k / n) * Math.PI / 2);
        pts.push([cx + (j / n) * half, Math.pow(v, 1.25) * L.maxH * taper * (1 + 0.1 * layer)]);
      }
      const path = (sgn) => {
        g.moveTo(pts[0][0], cy - sgn * pts[0][1]);
        for (let q = 1; q < pts.length - 1; q++) {
          const mx = (pts[q][0] + pts[q + 1][0]) / 2;
          const my = cy - sgn * (pts[q][1] + pts[q + 1][1]) / 2;
          g.quadraticCurveTo(pts[q][0], cy - sgn * pts[q][1], mx, my);
        }
        g.lineTo(pts[pts.length - 1][0], cy - sgn * pts[pts.length - 1][1]);
      };
      const fill = g.createLinearGradient(0, cy - L.maxH, 0, cy + L.maxH);
      fill.addColorStop(0, rgba(col, 0));
      fill.addColorStop(0.5, rgba(col, 0.16 * fade));
      fill.addColorStop(1, rgba(col, 0));
      g.fillStyle = fill;
      g.beginPath();
      path(1);
      for (let q = pts.length - 1; q >= 0; q--) g.lineTo(pts[q][0], cy + pts[q][1]);
      g.closePath();
      g.fill();

      g.strokeStyle = rgba(col, (layer === 0 ? 0.95 : 0.5) * fade);
      g.lineWidth = (layer === 0 ? 2.6 : 1.4) * u;
      g.lineJoin = 'round';
      g.beginPath();
      path(1);
      g.stroke();
      g.beginPath();
      path(-1);
      g.stroke();
    }

    // Nucleo luminoso al centro sulla cassa.
    const cr = (30 + 90 * F.pulse * react) * u;
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, cr);
    core.addColorStop(0, rgba(mix(this.cA, [255, 255, 255], 0.5), 0.5 * F.pulse));
    core.addColorStop(1, rgba(this.cA, 0));
    g.fillStyle = core;
    g.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);

    if (S.particles) this.drawBursts(g, L, A, F, (seed, d) => {
      const a = rand(seed) * TAU;
      return [cx + Math.cos(a) * d * 1.6, cy + Math.sin(a) * d * 0.6];
    });
  }

  drawIdle(g, L, t) {
    const { u, cx, cy } = L;
    const r = 120 * u * (1 + 0.03 * Math.sin(t * 2));
    g.strokeStyle = rgba(this.cA, 0.6);
    g.lineWidth = 2 * u;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.stroke();
  }

  // ---------- Titoli, testo, avanzamento ----------

  drawOverlay(ctx, L, F, A, S, lyrics, hasLyrics) {
    const { w, h, u } = L;
    const font = `"${S.font}", "Avenir Next", "Helvetica Neue", sans-serif`;
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    if (S.showTitle && (S.title || S.artist)) {
      const titleSize = (L.portrait ? 58 : 44) * u;
      const artistSize = (L.portrait ? 24 : 20) * u;
      let x, y;
      if (L.portrait) {
        ctx.textAlign = 'center';
        x = w / 2;
        y = h * 0.1;
      } else {
        ctx.textAlign = 'left';
        x = 72 * u;
        y = 92 * u;
      }
      if (S.artist) {
        ctx.font = `500 ${artistSize}px ${font}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${(artistSize * 0.32).toFixed(1)}px`;
        ctx.fillStyle = rgba(this.cB, 0.75);
        ctx.fillText(S.artist.toUpperCase(), x, y);
      }
      if (S.title) {
        ctx.font = `600 ${titleSize}px ${font}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${(titleSize * 0.01).toFixed(1)}px`;
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        ctx.fillText(S.title, x, y + (S.artist ? titleSize * 1.15 : 0));
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    if (hasLyrics && A) this.drawLyrics(ctx, L, F, lyrics, font);

    if (S.showProgress && A) {
      const m = (L.portrait ? 90 : 72) * u;
      const y = h - (L.portrait ? 110 : 44) * u;
      const p = clamp01(F.t / A.duration);
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.moveTo(m, y);
      ctx.lineTo(w - m, y);
      ctx.stroke();
      ctx.strokeStyle = rgba(this.cA, 0.85);
      ctx.beginPath();
      ctx.moveTo(m, y);
      ctx.lineTo(m + (w - 2 * m) * p, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  wrap(ctx, text, maxW) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = word;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  drawLyrics(ctx, L, F, lyrics, font) {
    const t = F.t;
    const idx = lastIndexAtOrBefore(lyrics, t, 't');
    if (idx < 0) return;
    const size = L.lyricSize;
    ctx.font = `600 ${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18 * L.u;

    const drawLine = (line, alpha, dy, scale) => {
      if (!line.text || alpha <= 0.01) return;
      const rows = this.wrap(ctx, line.text, L.lyricMaxW);
      const lh = size * 1.22;
      const y0 = L.lyricY - ((rows.length - 1) * lh) / 2 + dy;
      ctx.save();
      ctx.translate(L.w / 2, L.lyricY);
      ctx.scale(scale, scale);
      ctx.translate(-L.w / 2, -L.lyricY);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      rows.forEach((r, k) => ctx.fillText(r, L.w / 2, y0 + k * lh + size * 0.35));
      ctx.restore();
    };

    const cur = lyrics[idx];
    const next = lyrics[idx + 1];
    const age = t - cur.t;
    const hold = next ? next.t - cur.t : Infinity;
    let alpha = easeOutCubic(clamp01(age / 0.3));
    if (hold > 9 && age > 7) alpha *= clamp01(1 - (age - 7) / 0.6); // righe lunghissime: sfumano
    const scale = 1 + 0.018 * F.pulse;
    drawLine(cur, alpha, (1 - alpha) * 18 * L.u, scale);

    const prev = lyrics[idx - 1];
    if (prev && age < 0.28) {
      const p = age / 0.28;
      drawLine(prev, (1 - p) * 0.9, -p * 22 * L.u, 1);
    }
    ctx.shadowBlur = 0;
  }
}
