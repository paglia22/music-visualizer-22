import { BAR_COUNT, lastIndexAtOrBefore } from './analysis.js';

// Il rendering è "senza stato": ogni fotogramma dipende solo dal tempo t.
// Così si può saltare in qualsiasi punto e l'esportazione coincide con l'anteprima.

const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Compressione morbida: sopra 0.75 si avvicina a 1 senza appiattirsi.
const softClip = (x) => (x <= 0.75 ? Math.max(0, x) : 0.75 + 0.25 * Math.tanh((x - 0.75) / 0.25));
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
const easeOutBack = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const rand = (seed) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const WHITE = [255, 255, 255];

/** Rotazione di tinta (matrice standard sul piano della luminanza). */
function rotateHue([r, g, b], deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const m = [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
  const cl = (x) => Math.max(0, Math.min(255, x));
  return [cl(m[0] * r + m[1] * g + m[2] * b), cl(m[3] * r + m[4] * g + m[5] * b), cl(m[6] * r + m[7] * g + m[8] * b)];
}

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
    this.logo = null;
    this.bgCache = null;
    this.bgKey = '';
    this.colorKey = '';
    this.grainTiles = null;
  }

  setImages({ cover, background, logo }) {
    if (cover !== undefined) this.cover = cover;
    if (logo !== undefined) this.logo = logo;
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

  /** Colori del fotogramma: base dalla palette, eventualmente ruotati nel tempo. */
  prepareColors(S, F) {
    const key = S.colorA + S.colorB + S.colorBg + S.colorBg2;
    if (key !== this.colorKey) {
      this.colorKey = key;
      this.baseA = hexToRgb(S.colorA);
      this.baseB = hexToRgb(S.colorB);
      this.cBg = hexToRgb(S.colorBg);
      this.cBg2 = hexToRgb(S.colorBg2);
      this.hueKey = null;
    }
    const deg = S.hueShift > 0 ? Math.round(S.hueShift * F.rot * 60) % 360 : 0;
    if (deg === this.hueKey) return;
    this.hueKey = deg;
    this.cA = deg ? rotateHue(this.baseA, deg) : this.baseA;
    this.cB = deg ? rotateHue(this.baseB, deg) : this.baseB;
    this.barColors = [];
    for (let b = 0; b < BAR_COUNT; b++) this.barColors.push(mix(this.cA, this.cB, Math.pow(b / (BAR_COUNT - 1), 0.8)));
  }

  /** Colore di una barra: p = posizione in frequenza 0..1, v = intensità 0..1. */
  colorAt(S, p, v) {
    if (S.colorMode === 'mono') return this.cA;
    if (S.colorMode === 'intensity') return mix(this.cA, this.cB, clamp01(v * 1.15));
    return this.barColors[Math.min(BAR_COUNT - 1, Math.round(p * (BAR_COUNT - 1)))];
  }

  layout(w, h, S, hasLyrics) {
    const u = Math.min(w, h) / 1080;
    const portrait = h > w * 1.2;
    const tall = h > w * 1.1; // 4:5 e 9:16
    const square = !tall && w < h * 1.2;
    const L = { u, w, h, portrait, tall, square, cx: w / 2 };
    const sc = S.scale;
    if (S.style === 'orbit') {
      if (portrait) Object.assign(L, { cy: h * 0.42, ringR: 185 * u, barLen: 205 * u });
      else if (tall) Object.assign(L, { cy: h * (hasLyrics ? 0.43 : 0.47), ringR: 150 * u, barLen: 170 * u });
      else if (square) Object.assign(L, { cy: h * (hasLyrics ? 0.44 : 0.5), ringR: 125 * u, barLen: 150 * u });
      else Object.assign(L, { cy: h * (hasLyrics ? 0.45 : 0.5), ringR: 135 * u, barLen: 160 * u });
      L.ringR *= sc;
      L.barLen *= sc;
    } else {
      if (portrait) Object.assign(L, { cy: h * 0.42, spanW: w * 0.9, maxH: h * 0.13, perSide: 34 });
      else if (tall) Object.assign(L, { cy: h * (hasLyrics ? 0.44 : 0.48), spanW: w * 0.88, maxH: h * 0.17, perSide: 38 });
      else if (square) Object.assign(L, { cy: h * (hasLyrics ? 0.45 : 0.5), spanW: w * 0.86, maxH: h * 0.2, perSide: 40 });
      else Object.assign(L, { cy: h * (hasLyrics ? 0.46 : 0.5), spanW: w * 0.82, maxH: h * 0.24, perSide: 64 });
      L.spanW = Math.min(w * 0.98, L.spanW * sc);
      L.maxH *= sc;
    }
    L.cy += S.offsetY * h;

    const lyricPos = {
      top: portrait ? 0.22 : 0.17,
      center: 0.5,
      bottom: portrait ? 0.8 : tall ? 0.84 : 0.86,
      auto: portrait ? 0.72 : tall ? 0.8 : S.style === 'orbit' ? 0.885 : 0.84,
    };
    L.lyricY = h * (lyricPos[S.lyricsPosition] ?? lyricPos.auto);
    L.lyricSize = (portrait ? 62 : square || tall ? 52 : 52) * u * S.lyricsSize;
    L.lyricMaxW = w * (tall ? 0.84 : 0.7);
    return L;
  }

  /** Disegna il fotogramma al tempo t sul contesto ctx (dimensioni w×h). */
  render(ctx, w, h, t, A, E, S, lyrics) {
    this.ensureLayers(w, h);
    const hasLyrics = S.showLyrics && lyrics && lyrics.length > 0;
    const L = this.layout(w, h, S, hasLyrics);
    // La grafica può anticipare o ritardare l'audio (Sincronia); testo e avanzamento no.
    const tA = t + (S.syncOffset || 0) / 1000;
    const i = A ? Math.max(0, Math.min(A.nFrames - 1, Math.round(tA * A.fps))) : 0;
    const F = A
      ? {
          i, t: tA, tReal: t,
          bass: E.bass[i], sub: E.sub[i], mid: E.mid[i], high: E.high[i],
          pulse: E.pulse[i], flash: E.flash[i], energy: E.energy[i], rot: E.rot[i],
          react: S.reactivity,
        }
      : { i: 0, t, tReal: t, bass: 0, sub: 0, mid: 0, high: 0, pulse: 0, flash: 0, energy: 0, rot: 0, react: S.reactivity };
    this.prepareColors(S, F);

    this.drawBackground(ctx, L, F, S);

    const g = this.fgc;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    // "Punch" della camera sulla cassa, più una vibrazione opzionale.
    const zoom = 1 + (0.022 * F.pulse * F.react + 0.01 * F.bass) * S.punch;
    const shake = S.shake * F.pulse * 16 * L.u;
    g.translate(L.cx + (rand(i * 1.7) - 0.5) * 2 * shake, L.cy + (rand(i * 2.3 + 5) - 0.5) * 2 * shake);
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
    this.drawFlash(ctx, L, F, S);
    this.drawVignette(ctx, L, S);
    this.drawGrain(ctx, L, F, S);
    this.drawOverlay(ctx, L, F, A, S, lyrics, hasLyrics);
    this.drawLogo(ctx, L, S);
    this.drawFade(ctx, L, F, A, S);
  }

  // ---------- Sfondo ed effetti di schermo ----------

  drawBackground(ctx, L, F, S) {
    const { w, h, u } = L;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (S.bgMode === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, w * 0.3, h);
      grad.addColorStop(0, rgba(this.cBg, 1));
      grad.addColorStop(1, rgba(this.cBg2, 1));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = rgba(this.cBg, 1);
    }
    ctx.fillRect(0, 0, w, h);

    if (this.background) {
      const key = `${w}x${h}:${S.bgBlur}:${S.bgDim}`;
      if (!this.bgCache || this.bgKey !== key) {
        this.bgCache = this.buildBackground(w, h, u, S);
        this.bgKey = key;
      }
      const z = 1.04 + (0.025 * F.pulse * F.react + 0.02 * F.energy) * S.punch;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(z, z);
      ctx.globalAlpha = 0.6 + 0.25 * F.energy;
      ctx.drawImage(this.bgCache, -w / 2, -h / 2, w, h);
      ctx.restore();
    }

    // Alone centrale che respira con i bassi.
    if (S.glow > 0) {
      const r = Math.max(w, h) * (0.55 + 0.1 * F.bass);
      const grad = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, r);
      const a = (0.05 + 0.13 * F.bass * F.react + 0.07 * F.energy) * S.glow;
      grad.addColorStop(0, rgba(this.cA, Math.min(1, a)));
      grad.addColorStop(0.45, rgba(mix(this.cA, this.cB, 0.5), Math.min(1, a * 0.35)));
      grad.addColorStop(1, rgba(this.cA, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  buildBackground(w, h, u, S) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const img = this.background;
    const s = Math.max(w / img.width, h / img.height) * (1 + 0.1 * S.bgBlur);
    const dw = img.width * s, dh = img.height * s;
    const blur = Math.round(60 * S.bgBlur * u);
    if (blur > 0 && typeof g.filter === 'string') g.filter = `blur(${blur}px)`;
    g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    g.filter = 'none';
    g.fillStyle = `rgba(0,0,0,${S.bgDim})`;
    g.fillRect(0, 0, w, h);
    return c;
  }

  drawFlash(ctx, L, F, S) {
    if (S.flash <= 0 || F.flash < 0.02) return;
    const r = Math.max(L.w, L.h) * 0.8;
    const grad = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, r);
    const a = Math.min(0.6, S.flash * F.flash * 0.38);
    grad.addColorStop(0, rgba(mix(this.cA, WHITE, 0.5), a));
    grad.addColorStop(1, rgba(this.cA, a * 0.25));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.restore();
  }

  drawVignette(ctx, L, S) {
    if (S.vignette <= 0) return;
    const { w, h } = L;
    const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${S.vignette})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  drawGrain(ctx, L, F, S) {
    if (S.grain <= 0) return;
    if (!this.grainTiles) {
      this.grainTiles = [];
      for (let k = 0; k < 4; k++) {
        const c = makeCanvas(256, 256);
        const g = c.getContext('2d');
        const img = g.createImageData(256, 256);
        for (let p = 0; p < img.data.length; p += 4) {
          const v = rand(k * 9973 + p * 0.25) * 255;
          img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
          img.data[p + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        this.grainTiles.push(c);
      }
      this.grainPatterns = new Map();
    }
    let pat = this.grainPatterns.get(ctx);
    if (!pat) {
      pat = this.grainTiles.map((c) => ctx.createPattern(c, 'repeat'));
      this.grainPatterns.set(ctx, pat);
    }
    const gs = Math.max(1, L.u * 1.3);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = S.grain * 0.35;
    ctx.scale(gs, gs);
    ctx.translate(-rand(F.i) * 256, -rand(F.i + 0.5) * 256);
    ctx.fillStyle = pat[F.i % 4];
    ctx.fillRect(0, 0, L.w / gs + 256, L.h / gs + 256);
    ctx.restore();
  }

  drawFade(ctx, L, F, A, S) {
    if (!A) return;
    const [rs, re] = playRange(A, S);
    const t = F.tReal;
    let a = 0;
    if (S.fadeIn > 0) a = Math.max(a, 1 - (t - rs) / S.fadeIn);
    if (S.fadeOut > 0) a = Math.max(a, 1 - (re - t) / S.fadeOut);
    a = clamp01(a);
    if (a <= 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.restore();
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

  /** Ricampiona le 96 bande in n barre (massimo per gruppo). */
  sampleBars(E, i, n) {
    const out = new Float32Array(n);
    const off = i * BAR_COUNT;
    const usable = BAR_COUNT - 6;
    for (let j = 0; j < n; j++) {
      const a = Math.min(usable - 1, Math.floor((j / n) * usable));
      const b = Math.max(a + 1, Math.floor(((j + 1) / n) * usable));
      let v = 0;
      for (let k = a; k < b; k++) v = Math.max(v, E.bars[off + k]);
      out[j] = v;
    }
    return out;
  }

  /** Polvere ambientale: si muove con la rotazione cumulativa e brilla con gli acuti. */
  drawDust(g, L, F, S, count, area) {
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
      g.fillStyle = rgba(S.colorMode === 'mono' ? this.cA : mix(this.cA, this.cB, r2), a);
      const s = (0.8 + 1.8 * r1) * u;
      g.beginPath();
      g.arc(x, y, s, 0, TAU);
      g.fill();
    }
  }

  /** Scintille che esplodono sui colpi di cassa. */
  drawBursts(g, L, A, F, S, origin) {
    const life = 1.1;
    const { u } = L;
    for (let j = lastIndexAtOrBefore(A.kicks, F.t, 't'); j >= 0; j--) {
      const k = A.kicks[j];
      const age = F.t - k.t;
      if (age > life) break;
      if (k.s < 0.35) continue;
      const p = age / life;
      const n = Math.round((8 + 14 * k.s * F.react) * S.particles);
      for (let q = 0; q < n; q++) {
        const seed = j * 131 + q * 17;
        const sp = 0.35 + 0.65 * rand(seed + 2);
        const d = easeOutQuart(p) * sp * L.burstDist * (0.6 + 0.6 * k.s);
        const [x, y] = origin(seed, d);
        const a = Math.pow(1 - p, 1.6) * (0.4 + 0.6 * k.s);
        g.fillStyle = rgba(S.colorMode === 'mono' ? this.cA : mix(this.cA, this.cB, rand(seed + 5)), a);
        g.beginPath();
        g.arc(x, y, (1.1 + 1.6 * rand(seed + 4)) * u * (1 - 0.5 * p), 0, TAU);
        g.fill();
      }
    }
  }

  /** Linee orizzontali che si allontanano dal centro sui colpi (Orizzonte, Onda). */
  drawLineRipples(g, L, A, F, S, half) {
    const { u, cx, cy } = L;
    const life = 1.2;
    for (let j = lastIndexAtOrBefore(A.kicks, F.t, 't'); j >= 0; j--) {
      const k = A.kicks[j];
      const age = F.t - k.t;
      if (age > life) break;
      const p = age / life;
      const dy = easeOutCubic(p) * L.h * 0.45;
      const a = Math.pow(1 - p, 2) * k.s * 0.45 * Math.min(1.4, F.react);
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
  }

  // ---------- Stile: Orbita ----------

  drawOrbit(g, L, F, A, E, S) {
    const { u, cx, cy } = L;
    const react = F.react;
    const R = L.ringR * (1 + 0.075 * F.bass * react + 0.07 * F.pulse * react);
    const gap = 10 * u;
    L.burstDist = L.barLen * 1.6;

    if (S.particles > 0) this.drawDust(g, L, F, S, Math.round(80 * S.particles), 'radial');

    // Onde concentriche sui colpi di cassa.
    if (S.showRipples) {
      const life = 1.4;
      const maxR = Math.max(L.w, L.h) * 0.62;
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
    }

    // Barre radiali: speculari (bassi in alto o in basso) oppure su tutto il giro.
    const perSide = Math.max(24, Math.round(BAR_COUNT * S.density));
    const total = S.mirror ? perSide : perSide * 2;
    const vals = this.sampleBars(E, F.i, total);
    const base = (S.orientation === 'bottom' ? Math.PI / 2 : -Math.PI / 2) + F.rot * S.spin * 0.8;
    g.lineCap = 'round';
    g.lineWidth = 3.4 * u * S.barWidth * Math.min(2.2, Math.pow(BAR_COUNT / perSide, 0.6));
    for (let b = 0; b < total; b++) {
      const v = softClip(vals[b] * (0.5 + 0.4 * react));
      const len = 3 * u + Math.pow(v, 1.35) * L.barLen;
      g.strokeStyle = rgba(this.colorAt(S, b / (total - 1), v), 0.3 + 0.7 * v);
      g.beginPath();
      const sides = S.mirror ? [1, -1] : [1];
      for (const side of sides) {
        const a = S.mirror ? base + side * ((b + 0.5) / total) * Math.PI : base + ((b + 0.5) / total) * TAU;
        const c = Math.cos(a), s = Math.sin(a);
        g.moveTo(cx + c * (R + gap), cy + s * (R + gap));
        g.lineTo(cx + c * (R + gap + len), cy + s * (R + gap + len));
      }
      g.stroke();
    }

    // Anello di punti che avanza a ogni beat.
    if (S.showTicks) {
      const tickR = L.ringR * 1.16 + L.barLen + 34 * u;
      const dots = 72;
      const tick = this.beatTick(A, F.t);
      const start = (tick * TAU) / dots / 2 - Math.PI / 2;
      for (let d = 0; d < dots; d++) {
        const a = start + (d / dots) * TAU;
        const major = d % 6 === 0;
        g.fillStyle = rgba(major ? this.cA : this.cB, (major ? 0.45 : 0.18) + 0.45 * F.flash);
        g.beginPath();
        g.arc(cx + Math.cos(a) * tickR, cy + Math.sin(a) * tickR, (major ? 2.6 : 1.5) * u, 0, TAU);
        g.fill();
      }
    }

    if (S.particles > 0) this.drawBursts(g, L, A, F, S, (seed, d) => {
      const a = rand(seed) * TAU;
      return [cx + Math.cos(a) * (R + gap + d), cy + Math.sin(a) * (R + gap + d)];
    });

    // Nucleo: copertina, oscilloscopio circolare oppure solo luce.
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

      if (S.core === 'scope') {
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
      } else if (S.core === 'pulse') {
        const pr = inner * (0.25 + 0.35 * F.pulse * react);
        const dot = g.createRadialGradient(cx, cy, 0, cx, cy, pr);
        dot.addColorStop(0, rgba(mix(this.cB, WHITE, 0.4), 0.9));
        dot.addColorStop(1, rgba(this.cA, 0));
        g.fillStyle = dot;
        g.beginPath();
        g.arc(cx, cy, pr, 0, TAU);
        g.fill();
      }
    }

    g.strokeStyle = rgba(mix(this.cA, WHITE, 0.25 * F.flash), 0.95);
    g.lineWidth = (2.6 + 1.5 * F.flash) * u * Math.sqrt(S.barWidth);
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

  drawHorizon(g, L, F, A, E, S) {
    const { u, cx, cy } = L;
    const react = F.react;
    const n = Math.max(10, Math.round(L.perSide * S.density));
    const half = L.spanW / 2;
    const step = half / n;
    const vals = this.sampleBars(E, F.i, n);
    L.burstDist = L.maxH * 1.5;

    if (S.particles > 0) this.drawDust(g, L, F, S, Math.round(60 * S.particles), 'field');
    if (S.showRipples) this.drawLineRipples(g, L, A, F, S, half);

    // Barre: bassi al centro, riflesso attenuato sotto.
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.5 * u, Math.min(step * 0.92, step * 0.48 * S.barWidth));
    const gap = 6 * u;
    for (let j = 0; j < n; j++) {
      const v = softClip(vals[j] * (0.5 + 0.4 * react));
      const hh = 2 * u + Math.pow(v, 1.3) * L.maxH;
      const col = this.colorAt(S, j / (n - 1), v);
      const a = 0.35 + 0.65 * v;
      for (const sgn of [-1, 1]) {
        const x = cx + sgn * (j + 0.5) * step;
        g.strokeStyle = rgba(col, a);
        g.beginPath();
        g.moveTo(x, cy - gap);
        g.lineTo(x, cy - gap - hh);
        g.stroke();
        if (S.reflection) {
          g.strokeStyle = rgba(col, a * 0.28);
          g.beginPath();
          g.moveTo(x, cy + gap);
          g.lineTo(x, cy + gap + hh * 0.6);
          g.stroke();
        }
      }
    }

    // La linea di luce.
    const lw = L.w * 0.96;
    const grad = g.createLinearGradient(cx - lw / 2, 0, cx + lw / 2, 0);
    const la = 0.35 + 0.6 * F.flash;
    grad.addColorStop(0, rgba(this.cB, 0));
    grad.addColorStop(0.5, rgba(mix(this.cB, WHITE, 0.4 * F.flash), la));
    grad.addColorStop(1, rgba(this.cB, 0));
    g.fillStyle = grad;
    const th = (1.4 + 2.5 * F.pulse * react) * u;
    g.fillRect(cx - lw / 2, cy - th / 2, lw, th);

    if (S.particles > 0) this.drawBursts(g, L, A, F, S, (seed, d) => {
      const x = cx + (rand(seed) - 0.5) * L.spanW;
      const dir = S.reflection && rand(seed + 9) > 0.5 ? 1 : -1;
      return [x + (rand(seed + 3) - 0.5) * d * 0.4, cy + dir * d];
    });
  }

  // ---------- Stile: Onda ----------

  drawWave(g, L, F, A, E, S) {
    const { u, cx, cy } = L;
    const react = F.react;
    const n = Math.max(12, Math.round(40 * S.density));
    const half = L.spanW / 2;
    L.burstDist = L.maxH * 1.4;

    if (S.particles > 0) this.drawDust(g, L, F, S, Math.round(60 * S.particles), 'field');
    if (S.showRipples) this.drawLineRipples(g, L, A, F, S, half);

    const layers = Math.max(1, Math.round(S.waveLayers));
    for (let layer = layers - 1; layer >= 0; layer--) {
      const fi = Math.max(0, F.i - layer * Math.round(0.07 * A.fps));
      const vals = this.sampleBars(E, fi, n);
      const col = S.colorMode === 'mono' ? this.cA : mix(this.cA, this.cB, layers > 1 ? layer / (layers - 1) : 0);
      const fade = 1 - layer / (layers + 0.5);
      const pts = [];
      for (let j = -n; j <= n; j++) {
        const k = Math.abs(j);
        const v = softClip(vals[Math.min(n - 1, k)] * (0.5 + 0.4 * react));
        const taper = Math.sin(((1 - k / n) * Math.PI) / 2);
        pts.push([cx + (j / n) * half, Math.pow(v, 1.25) * L.maxH * taper * (1 + 0.1 * layer)]);
      }
      const path = (sgn) => {
        g.moveTo(pts[0][0], cy - sgn * pts[0][1]);
        for (let q = 1; q < pts.length - 1; q++) {
          const mx = (pts[q][0] + pts[q + 1][0]) / 2;
          const my = cy - (sgn * (pts[q][1] + pts[q + 1][1])) / 2;
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
      g.lineWidth = (layer === 0 ? 2.6 : 1.4) * u * S.barWidth;
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
    core.addColorStop(0, rgba(mix(this.cA, WHITE, 0.5), 0.5 * F.pulse));
    core.addColorStop(1, rgba(this.cA, 0));
    g.fillStyle = core;
    g.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);

    if (S.particles > 0) this.drawBursts(g, L, A, F, S, (seed, d) => {
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

  // ---------- Titoli, testo, avanzamento, logo ----------

  drawOverlay(ctx, L, F, A, S, lyrics, hasLyrics) {
    const { w, h, u } = L;
    const font = `"${S.font}", "Avenir Next", "Helvetica Neue", sans-serif`;
    const textRgb = hexToRgb(S.textColor);
    ctx.save();
    ctx.textBaseline = 'alphabetic';

    if (S.showTitle && (S.title || S.artist)) {
      const titleSize = (L.portrait ? 58 : 44) * u * S.titleSize;
      const artistSize = (L.portrait ? 24 : 20) * u * S.titleSize;
      let pos = S.titlePosition;
      if (pos === 'auto') pos = L.tall ? 'top-center' : 'top-left';
      const [vert, horiz] = pos.split('-');
      const margin = 72 * u;
      ctx.textAlign = horiz === 'center' ? 'center' : 'left';
      const x = horiz === 'center' ? w / 2 : margin;
      const blockH = (S.artist ? artistSize * 1.6 : 0) + (S.title ? titleSize : 0);
      let yTop;
      if (vert === 'top') yTop = horiz === 'center' && L.tall ? h * 0.1 - artistSize : margin;
      else yTop = h - (S.showProgress ? 110 : 70) * u - blockH - (L.portrait ? 60 * u : 0);
      let y = yTop + (S.artist ? artistSize : titleSize);
      if (S.artist) {
        ctx.font = `500 ${artistSize}px ${font}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${(artistSize * 0.32).toFixed(1)}px`;
        ctx.fillStyle = rgba(this.cB, 0.8);
        ctx.fillText(S.artist.toUpperCase(), x, y);
        y += titleSize * 1.15;
      }
      if (S.title) {
        ctx.font = `600 ${titleSize}px ${font}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = `${(titleSize * (S.titleUpper ? 0.08 : 0.01)).toFixed(1)}px`;
        ctx.fillStyle = rgba(textRgb, 0.95);
        ctx.fillText(S.titleUpper ? S.title.toUpperCase() : S.title, x, y);
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    if (hasLyrics && A) this.drawLyrics(ctx, L, F, S, lyrics, font, textRgb);

    if (S.showProgress && A) {
      const m = (L.portrait ? 90 : 72) * u;
      const y = h - (L.portrait ? 110 : 44) * u;
      const [rs, re] = playRange(A, S);
      const p = clamp01((F.tReal - rs) / Math.max(0.01, re - rs));
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = rgba(textRgb, 0.12);
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

  /**
   * Blocco di testo centrato su (cx, cy). opts: alpha, dy, scale, reveal (0..1, scoperta da sinistra),
   * karaoke (0..1, avanzamento del colore evidenziato), size, color.
   * Ritorna l'altezza del blocco.
   */
  drawTextBlock(ctx, L, text, font, weight, opts) {
    const { alpha = 1, dy = 0, scale = 1, reveal = null, karaoke = null, size, color, cy } = opts;
    if (!text || alpha <= 0.01) return 0;
    ctx.font = `${weight} ${size}px ${font}`;
    const rows = this.wrap(ctx, text, L.lyricMaxW);
    const widths = rows.map((r) => ctx.measureText(r).width);
    const total = widths.reduce((a, b) => a + b, 0);
    const lh = size * 1.22;
    const blockH = rows.length * lh;
    const y0 = cy - ((rows.length - 1) * lh) / 2 + dy;
    const cx = L.w / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18 * L.u;

    const sweep = (covered, fill) => {
      let acc = 0;
      rows.forEach((r, k) => {
        const rowCovered = Math.max(0, Math.min(widths[k], covered - acc));
        acc += widths[k];
        if (rowCovered <= 0) return;
        const y = y0 + k * lh + size * 0.35;
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - widths[k] / 2 - size, y - size * 1.1, rowCovered + size, size * 1.6);
        ctx.clip();
        ctx.fillStyle = fill;
        ctx.fillText(r, cx, y);
        ctx.restore();
      });
    };

    if (reveal !== null) {
      sweep(total * reveal, rgba(color, alpha));
    } else if (karaoke !== null) {
      ctx.fillStyle = rgba(color, alpha * 0.42);
      rows.forEach((r, k) => ctx.fillText(r, cx, y0 + k * lh + size * 0.35));
      ctx.shadowBlur = 0;
      sweep(total * karaoke, rgba(mix(this.cB, WHITE, 0.15), alpha));
    } else {
      ctx.fillStyle = rgba(color, alpha);
      rows.forEach((r, k) => ctx.fillText(r, cx, y0 + k * lh + size * 0.35));
    }
    ctx.restore();
    return blockH;
  }

  drawLyrics(ctx, L, F, S, lyrics, font, textRgb) {
    const t = F.tReal;
    const idx = lastIndexAtOrBefore(lyrics, t, 't');
    if (idx < 0) return;
    const size = L.lyricSize;
    const weight = S.lyricsWeight;
    const up = (s) => (S.lyricsUpper ? s.toUpperCase() : s);

    const cur = lyrics[idx];
    const next = lyrics[idx + 1];
    const prev = lyrics[idx - 1];
    const age = t - cur.t;
    const hold = next ? next.t - cur.t : Infinity;
    let life = 1;
    if (hold > 9 && age > 7) life = clamp01(1 - (age - 7) / 0.6); // righe lunghissime: sfumano
    const base = { size, color: textRgb, cy: L.lyricY };
    const pulseScale = 1 + 0.018 * F.pulse;
    let blockH = 0;

    if (cur.text) {
      const text = up(cur.text);
      if (S.lyricsAnim === 'pop') {
        const p = clamp01(age / 0.35);
        blockH = this.drawTextBlock(ctx, L, text, font, weight, {
          ...base, alpha: clamp01(age / 0.1) * life, scale: (0.8 + 0.2 * easeOutBack(p)) * pulseScale,
        });
      } else if (S.lyricsAnim === 'wipe') {
        blockH = this.drawTextBlock(ctx, L, text, font, weight, {
          ...base, alpha: life, reveal: easeOutCubic(clamp01(age / 0.6)), scale: pulseScale,
        });
      } else if (S.lyricsAnim === 'karaoke') {
        const dur = Math.min(Math.max(0.3, hold - 0.15), 0.085 * text.length + 0.6);
        blockH = this.drawTextBlock(ctx, L, text, font, weight, {
          ...base, alpha: easeOutCubic(clamp01(age / 0.2)) * life, karaoke: clamp01(age / dur), scale: pulseScale,
        });
      } else {
        const a = easeOutCubic(clamp01(age / 0.3));
        blockH = this.drawTextBlock(ctx, L, text, font, weight, {
          ...base, alpha: a * life, dy: (1 - a) * 18 * L.u, scale: pulseScale,
        });
      }
    }

    // La riga precedente esce verso l'alto (non per la scoperta progressiva).
    const prevHold = prev ? cur.t - prev.t : 0;
    if (prev?.text && age < 0.28 && S.lyricsAnim !== 'wipe' && prevHold <= 9) {
      const p = age / 0.28;
      this.drawTextBlock(ctx, L, up(prev.text), font, weight, { ...base, alpha: (1 - p) * 0.9, dy: -p * 22 * L.u });
    }

    if (S.showNextLine && next?.text && life > 0) {
      const ny = L.lyricY + Math.max(blockH, size * 1.22) / 2 + size * 0.75;
      this.drawTextBlock(ctx, L, up(next.text), font, Math.min(weight, 500), {
        size: size * 0.6, color: textRgb, cy: ny, alpha: 0.4 * life * clamp01(age / 0.3),
      });
    }
  }

  drawLogo(ctx, L, S) {
    const img = this.logo;
    if (!img) return;
    const max = S.logoSize * Math.min(L.w, L.h);
    const s = max / Math.max(img.width, img.height);
    const dw = img.width * s, dh = img.height * s;
    const m = 56 * L.u;
    const [vert, horiz] = S.logoPosition.split('-');
    const x = horiz === 'left' ? m : horiz === 'center' ? (L.w - dw) / 2 : L.w - m - dw;
    const y = vert === 'top' ? m : L.h - m - dh - (S.showProgress ? 40 * L.u : 0);
    ctx.save();
    ctx.globalAlpha = S.logoOpacity;
    ctx.drawImage(img, x, y, dw, dh);
    ctx.restore();
  }
}

/** Intervallo riprodotto/esportato: tutto il brano o l'estratto scelto. */
export function playRange(A, S) {
  if (!A) return [0, 0];
  if (!S.rangeEnabled) return [0, A.duration];
  const start = Math.max(0, Math.min(A.duration - 0.5, S.rangeStart));
  const end = Math.max(start + 0.5, Math.min(A.duration, S.rangeEnd));
  return [start, end];
}
