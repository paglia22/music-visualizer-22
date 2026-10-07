export const PALETTES = {
  brace: { name: 'Brace', a: '#ff6a2b', b: '#ffd27a', bg: '#0b0706' },
  ghiaccio: { name: 'Ghiaccio', a: '#58e1ff', b: '#a98bff', bg: '#05070d' },
  avorio: { name: 'Avorio', a: '#f4efe6', b: '#9aa3ad', bg: '#08090b' },
  corallo: { name: 'Corallo', a: '#ff4d8d', b: '#ffb36b', bg: '#0c0609' },
  menta: { name: 'Menta', a: '#3dffc0', b: '#c6ff6a', bg: '#040b09' },
  notte: { name: 'Notte', a: '#7aa2ff', b: '#e8ecff', bg: '#05060c' },
};

export const STYLES = {
  orbit: { name: 'Orbita', desc: 'Anello circolare che pulsa sulla cassa' },
  horizon: { name: 'Orizzonte', desc: 'Barre speculari su una linea di luce' },
  wave: { name: 'Onda', desc: 'Curve fluide con scia nel tempo' },
};

export const FORMATS = {
  '16:9': { name: '16:9', hint: 'YouTube', w: 1920, h: 1080 },
  '9:16': { name: '9:16', hint: 'Reels · TikTok · Shorts', w: 1080, h: 1920 },
  '1:1': { name: '1:1', hint: 'Post', w: 1080, h: 1080 },
};

export const FONTS = ['Avenir Next', 'Helvetica Neue', 'Futura', 'Gill Sans', 'Didot', 'Baskerville'];

export const DEFAULT_SETTINGS = {
  format: '16:9',
  style: 'orbit',
  palette: 'brace',
  colorA: PALETTES.brace.a,
  colorB: PALETTES.brace.b,
  colorBg: PALETTES.brace.bg,
  reactivity: 1,
  smoothing: 0.45,
  bloom: 0.6,
  particles: true,
  title: '',
  artist: '',
  font: 'Avenir Next',
  showTitle: true,
  showProgress: true,
  lyrics: '',
  showLyrics: true,
  lyricsSize: 1,
  fps: 60,
  quality: 'high',
  previewHD: false,
};
