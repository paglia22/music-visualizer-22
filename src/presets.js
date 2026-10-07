export const PALETTES = {
  brace: { name: 'Brace', a: '#ff6a2b', b: '#ffd27a', bg: '#0b0706', bg2: '#2a0f05' },
  ghiaccio: { name: 'Ghiaccio', a: '#58e1ff', b: '#a98bff', bg: '#05070d', bg2: '#101a3a' },
  avorio: { name: 'Avorio', a: '#f4efe6', b: '#9aa3ad', bg: '#08090b', bg2: '#1c1d22' },
  corallo: { name: 'Corallo', a: '#ff4d8d', b: '#ffb36b', bg: '#0c0609', bg2: '#2b0a1c' },
  menta: { name: 'Menta', a: '#3dffc0', b: '#c6ff6a', bg: '#040b09', bg2: '#06261d' },
  notte: { name: 'Notte', a: '#7aa2ff', b: '#e8ecff', bg: '#05060c', bg2: '#141a3d' },
  tramonto: { name: 'Tramonto', a: '#ff5e62', b: '#ffcf70', bg: '#0d0610', bg2: '#3a1030' },
  oro: { name: 'Oro', a: '#e9c46a', b: '#fff3d1', bg: '#0a0806', bg2: '#241a08' },
};

export const STYLES = {
  orbit: { name: 'Orbita', desc: 'Anello circolare che pulsa sulla cassa' },
  horizon: { name: 'Orizzonte', desc: 'Barre speculari su una linea di luce' },
  wave: { name: 'Onda', desc: 'Curve fluide con scia nel tempo' },
};

// Dimensioni a 1080p sul lato corto; la risoluzione le scala.
export const FORMATS = {
  '16:9': { name: '16:9', hint: 'YouTube', w: 1920, h: 1080 },
  '9:16': { name: '9:16', hint: 'Reels · TikTok', w: 1080, h: 1920 },
  '4:5': { name: '4:5', hint: 'Feed IG', w: 1080, h: 1350 },
  '1:1': { name: '1:1', hint: 'Post', w: 1080, h: 1080 },
};

export const RESOLUTIONS = {
  720: { name: '720p', hint: 'leggero' },
  1080: { name: '1080p', hint: 'Full HD' },
  1440: { name: '1440p', hint: '2K' },
  2160: { name: '2160p', hint: '4K' },
};

export function outputSize(format, resolution) {
  const f = FORMATS[format];
  const k = Number(resolution) / 1080;
  const even = (x) => Math.round((x * k) / 2) * 2;
  return [even(f.w), even(f.h)];
}

export const SYSTEM_FONTS = ['Avenir Next', 'Helvetica Neue', 'Futura', 'Gill Sans', 'Didot', 'Baskerville'];
export const WEB_FONTS = ['Montserrat', 'Inter', 'Space Grotesk', 'Syne', 'Bebas Neue', 'Playfair Display', 'DM Serif Display'];

export const DEFAULT_SETTINGS = {
  // Formato e stile
  format: '16:9',
  style: 'orbit',
  scale: 1,
  offsetY: 0,
  density: 1,
  barWidth: 1,
  mirror: true,
  orientation: 'top',
  spin: 0,
  core: 'scope',
  showTicks: true,
  showRipples: true,
  reflection: true,
  waveLayers: 4,
  // Colori
  palette: 'brace',
  colorA: PALETTES.brace.a,
  colorB: PALETTES.brace.b,
  colorBg: PALETTES.brace.bg,
  colorBg2: PALETTES.brace.bg2,
  colorMode: 'frequency',
  hueShift: 0,
  // Dinamica
  reactivity: 1,
  smoothing: 0.45,
  sensitivity: 0.5,
  syncOffset: 0,
  // Sfondo
  bgMode: 'solid',
  glow: 1,
  bgBlur: 0.5,
  bgDim: 0.45,
  // Effetti
  bloom: 0.6,
  punch: 1,
  flash: 0,
  shake: 0,
  particles: 1,
  vignette: 0.55,
  grain: 0,
  // Logo
  logoPosition: 'top-right',
  logoSize: 0.12,
  logoOpacity: 0.85,
  // Titoli
  title: '',
  artist: '',
  font: 'Avenir Next',
  textColor: '#ffffff',
  showTitle: true,
  titlePosition: 'auto',
  titleSize: 1,
  titleUpper: false,
  showProgress: true,
  // Testo della canzone
  lyrics: '',
  showLyrics: true,
  lyricsSize: 1,
  lyricsAnim: 'fade',
  lyricsPosition: 'auto',
  lyricsWeight: 600,
  lyricsUpper: false,
  showNextLine: false,
  // Esportazione
  fps: 60,
  quality: 'high',
  resolution: 1080,
  rangeEnabled: false,
  rangeStart: 0,
  rangeEnd: 30,
  fadeIn: 0,
  fadeOut: 1.5,
  previewHD: false,
};

// Le chiavi che NON fanno parte di un "look": contenuti ed esportazione.
const NON_LOOK = new Set([
  'format', 'title', 'artist', 'lyrics', 'fps', 'quality', 'resolution',
  'rangeEnabled', 'rangeStart', 'rangeEnd', 'previewHD',
]);
export const LOOK_KEYS = Object.keys(DEFAULT_SETTINGS).filter((k) => !NON_LOOK.has(k));

export function pickLook(settings) {
  const out = {};
  for (const k of LOOK_KEYS) out[k] = settings[k];
  return out;
}

export const BUILTIN_LOOKS = {
  elegante: { name: 'Elegante', look: {} },
  club: {
    name: 'Club',
    look: {
      reactivity: 1.35, smoothing: 0.15, sensitivity: 0.65, punch: 1.6, flash: 0.45, shake: 0.35,
      bloom: 0.8, particles: 1.4, palette: 'corallo', colorA: PALETTES.corallo.a, colorB: PALETTES.corallo.b,
      colorBg: PALETTES.corallo.bg, colorBg2: PALETTES.corallo.bg2, lyricsAnim: 'pop', spin: 0.3,
    },
  },
  morbido: {
    name: 'Morbido',
    look: {
      reactivity: 0.8, smoothing: 0.85, punch: 0.4, flash: 0, bloom: 0.45, particles: 0.6,
      palette: 'avorio', colorA: PALETTES.avorio.a, colorB: PALETTES.avorio.b, colorBg: PALETTES.avorio.bg,
      colorBg2: PALETTES.avorio.bg2, bgMode: 'gradient', vignette: 0.7, grain: 0.25, lyricsAnim: 'fade',
    },
  },
  neon: {
    name: 'Neon',
    look: {
      reactivity: 1.15, smoothing: 0.35, bloom: 1.1, glow: 1.6, punch: 1.2, flash: 0.2,
      palette: 'ghiaccio', colorA: PALETTES.ghiaccio.a, colorB: PALETTES.ghiaccio.b, colorBg: PALETTES.ghiaccio.bg,
      colorBg2: PALETTES.ghiaccio.bg2, bgMode: 'gradient', colorMode: 'intensity', hueShift: 0.25, lyricsAnim: 'karaoke',
    },
  },
};
