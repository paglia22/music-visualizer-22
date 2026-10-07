import { analyzeAudio, buildEnvelopes, detectEvents } from './analysis.js';
import { Renderer, playRange } from './renderer.js';
import { exportVideo, exportSupport, askSaveLocation, bitrateFor } from './exporter.js';
import { parseLyrics, plainLines, toLRC, hasTimestamps } from './lyrics.js';
import {
  PALETTES, STYLES, FORMATS, WEB_FONTS, DEFAULT_SETTINGS, BUILTIN_LOOKS, LOOK_KEYS, pickLook, outputSize,
} from './presets.js';
import { buildPanel } from './ui.js';
import { panelSchema, TABS } from './panel.js';

const $ = (sel) => document.querySelector(sel);
const STORE_KEY = 'onda-studio:settings';
const LOOKS_KEY = 'onda-studio:looks';
const TAB_KEY = 'onda-studio:tab';

const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage non disponibile */ }
  },
};

// ---------- Stato ----------
const state = {
  settings: loadSettings(),
  fileName: '',
  audioBuffer: null,
  analysis: null,
  envelopes: null,
  lyrics: [],
  images: { cover: null, background: null, logo: null },
  customFonts: [],
  userLooks: storage.get(LOOKS_KEY, {}),
  sync: null,
  dirty: true,
};
const renderer = new Renderer();
const canvas = $('#preview');
const ctx = canvas.getContext('2d', { alpha: false });
let panel;

function loadSettings() {
  const saved = storage.get(STORE_KEY, {});
  // Versione precedente: "particles" era un sì/no.
  if (typeof saved.particles === 'boolean') saved.particles = saved.particles ? 1 : 0;
  const S = { ...DEFAULT_SETTINGS, ...saved, lyrics: '' };
  if (!FORMATS[S.format]) S.format = DEFAULT_SETTINGS.format;
  return S;
}
let saveTimer;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { lyrics, ...rest } = state.settings;
    storage.set(STORE_KEY, rest);
    if (state.fileName) {
      try { localStorage.setItem(`onda-studio:lyrics:${state.fileName}`, lyrics); } catch {}
    }
  }, 300);
}

// ---------- Player (Web Audio, preciso al campione) ----------
const player = {
  ctx: null,
  source: null,
  gain: null,
  playing: false,
  offset: 0,
  startedAt: 0,
  ensureCtx() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext({ sampleRate: 48000 }); } catch { this.ctx = new AudioContext(); }
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  },
  time() {
    if (!state.audioBuffer) return 0;
    if (!this.playing) return this.offset;
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return Math.max(0, Math.min(state.audioBuffer.duration, this.ctx.currentTime - this.startedAt - latency));
  },
  play() {
    if (!state.audioBuffer || this.playing) return;
    const ac = this.ensureCtx();
    ac.resume();
    if (state.settings.rangeEnabled && !state.sync) {
      const [rs, re] = playRange(state.analysis, state.settings);
      if (this.offset < rs || this.offset >= re - 0.05) this.offset = rs;
    }
    if (this.offset >= state.audioBuffer.duration - 0.05) this.offset = 0;
    const src = ac.createBufferSource();
    src.buffer = state.audioBuffer;
    src.connect(this.gain);
    src.onended = () => {
      if (this.source === src && this.playing) {
        this.playing = false;
        this.offset = state.audioBuffer.duration;
        this.source = null;
        updateTransport();
        if (state.sync) finishSync();
      }
    };
    src.start(0, this.offset);
    this.source = src;
    this.startedAt = ac.currentTime - this.offset;
    this.playing = true;
    updateTransport();
  },
  pause() {
    if (!this.playing) return;
    this.offset = this.time();
    this.playing = false;
    const src = this.source;
    this.source = null;
    try { src.stop(); } catch {}
    updateTransport();
  },
  seek(t) {
    const was = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(state.audioBuffer?.duration || 0, t));
    if (was) this.play();
    state.dirty = true;
  },
  toggle() { this.playing ? this.pause() : this.play(); },
};

// ---------- Caricamento audio ----------
function prettyTitle(name) {
  return name.replace(/\.[^.]+$/, '').replace(/^\s*\d+\s*[.\-_)]\s*/, '').replace(/[_]+/g, ' ').trim();
}

async function loadAudio(data, name) {
  player.pause();
  showBusy('Decodifica audio…', 0.02);
  try {
    const ac = player.ensureCtx();
    const buf = await ac.decodeAudioData(data);
    state.audioBuffer = buf;
    state.fileName = name;
    player.offset = 0;
    showBusy('Analisi di ritmo e frequenze…', 0.05);
    const A = await analyzeAudio(buf, (p) => showBusy('Analisi di ritmo e frequenze…', 0.05 + 0.95 * p));
    state.analysis = A;
    recomputeEvents();

    const S = state.settings;
    S.title = prettyTitle(name);
    S.lyrics = (() => { try { return localStorage.getItem(`onda-studio:lyrics:${name}`) || ''; } catch { return ''; } })();
    if (S.rangeEnd <= S.rangeStart || S.rangeEnd > buf.duration) {
      S.rangeStart = Math.min(S.rangeStart, Math.max(0, buf.duration - 15));
      S.rangeEnd = Math.min(buf.duration, S.rangeStart + 30);
    }
    refreshLyrics();

    $('#trackMeta').textContent = name;
    $('#dropHint').hidden = true;
    $('#playBtn').disabled = false;
    $('#seek').disabled = false;
    hideBusy();
    afterSettingsChange();
    updateTransport();
  } catch (e) {
    console.error(e);
    hideBusy();
    alert(`Non riesco a leggere questo file audio.\n${e.message || e}\n\nProva con un MP3 o WAV.`);
  }
}

async function loadAudioFile(file) {
  if (!file) return;
  loadAudio(await file.arrayBuffer(), file.name);
}

/** Colpi (dipendono dalla sensibilità) e inviluppi (dipendono dalla morbidezza). */
function recomputeEvents() {
  const A = state.analysis;
  if (!A) return;
  Object.assign(A, detectEvents(A, state.settings.sensitivity));
  state.envelopes = buildEnvelopes(A, { smoothing: state.settings.smoothing });
}

function updateStats() {
  const A = state.analysis, buf = state.audioBuffer;
  if (!A) return;
  $('#stats').innerHTML =
    `<span>Durata <b>${fmtTime(buf.duration)}</b></span><span>BPM <b>${Math.round(A.bpm)}</b></span>` +
    `<span>Colpi <b>${A.kicks.length}</b></span><span><b>${buf.sampleRate / 1000} kHz</b> · ${buf.numberOfChannels === 1 ? 'mono' : 'stereo'}</span>`;
}

function showBusy(label, p) {
  $('#busy').hidden = false;
  $('#busyLabel').textContent = label;
  $('#busyBar').style.width = `${Math.round(p * 100)}%`;
}
function hideBusy() { $('#busy').hidden = true; }

// ---------- Impostazioni ----------
const fmtTime = (t, decimals = false) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return decimals ? `${m}:${s.toFixed(1).padStart(4, '0')}` : `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
};
const parseTime = (str) => {
  const parts = String(str).trim().replace(',', '.').split(':').map(Number);
  if (parts.some((x) => !Number.isFinite(x))) return null;
  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
};

function setSetting(key, value) {
  const S = state.settings;
  S[key] = value;
  if (['colorA', 'colorB', 'colorBg', 'colorBg2'].includes(key)) S.palette = '';
  if (key === 'smoothing' && state.analysis) state.envelopes = buildEnvelopes(state.analysis, { smoothing: value });
  if (key === 'sensitivity') recomputeEvents();
  if (key === 'lyrics') refreshLyrics();
  if (key === 'font') ensureFont(value);
  afterSettingsChange();
}

function applyLook(look) {
  Object.assign(state.settings, pickLook(DEFAULT_SETTINGS), look);
  recomputeEvents();
  ensureFont(state.settings.font);
  afterSettingsChange();
}

function afterSettingsChange() {
  panel.sync();
  document.documentElement.style.setProperty('--accent', state.settings.colorA);
  document.documentElement.style.setProperty('--accent-2', state.settings.colorB);
  resizePreview();
  updateRangeMark();
  updateStats();
  saveSettings();
  state.dirty = true;
}

function ensureFont(font) {
  if (!document.fonts || !WEB_FONTS.includes(font)) return;
  Promise.all([400, 500, 600, 800].map((w) => document.fonts.load(`${w} 40px "${font}"`)))
    .then(() => { state.dirty = true; })
    .catch(() => {});
}

function refreshLyrics() {
  const src = state.settings.lyrics || '';
  const { lines, meta } = parseLyrics(src);
  state.lyrics = lines;
  if (meta.ti && !state.settings.title) state.settings.title = meta.ti;
  if (meta.ar && !state.settings.artist) state.settings.artist = meta.ar;
  const badge = $('#lyricsBadge');
  if (badge) {
    if (!src.trim()) badge.textContent = '';
    else if (lines.length) badge.textContent = `${lines.filter((l) => l.text).length} righe a tempo`;
    else badge.textContent = 'da sincronizzare';
  }
  state.dirty = true;
}

function updateTransport() {
  $('#playBtn').classList.toggle('playing', player.playing);
  $('#playBtn').setAttribute('aria-label', player.playing ? 'Pausa' : 'Riproduci');
  $('#timeDur').textContent = fmtTime(state.audioBuffer?.duration || 0);
}

function updateRangeMark() {
  const mark = $('#rangeMark');
  const A = state.analysis;
  if (!A || !state.settings.rangeEnabled) {
    mark.hidden = true;
    return;
  }
  const [rs, re] = playRange(A, state.settings);
  mark.hidden = false;
  mark.style.left = `${(rs / A.duration) * 100}%`;
  mark.style.width = `${((re - rs) / A.duration) * 100}%`;
}

// ---------- Controlli personalizzati del pannello ----------
const STYLE_ICONS = {
  orbit: '<svg viewBox="0 0 34 34" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="17" cy="17" r="7"/><path d="M17 6v-3M17 31v-3M6 17H3M31 17h-3M9.2 9.2 7 7M27 27l-2.2-2.2M9.2 24.8 7 27M27 7l-2.2 2.2" stroke-linecap="round"/></svg>',
  horizon: '<svg viewBox="0 0 34 34" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 17h28"/><path d="M15 15V7M19 15V7M11 15v-5M23 15v-5M7 15v-3M27 15v-3" /><path d="M15 19v4M19 19v4M11 19v2M23 19v2" opacity=".45"/></svg>',
  wave: '<svg viewBox="0 0 34 34" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 17c4 0 5-9 9-9s5 18 9 18 5-9 10-9"/><path d="M3 17c4 0 6-5 9-5s6 10 9 10 6-5 10-5" opacity=".45"/></svg>',
};

function imagePicker(kind, label) {
  return (el) => {
    el.innerHTML =
      `<div class="image-row"><span>${label}</span>` +
      `<button class="btn small" type="button" data-pick>Scegli</button>` +
      `<button class="btn small ghost" type="button" data-clear hidden>Rimuovi</button></div>`;
    el.querySelector('[data-pick]').addEventListener('click', () => pickImage(kind));
    const clear = el.querySelector('[data-clear]');
    clear.addEventListener('click', () => {
      state.images[kind] = null;
      renderer.setImages({ [kind]: null });
      afterSettingsChange();
    });
    return () => { clear.hidden = !state.images[kind]; };
  };
}

const custom = {
  looks(el) {
    el.innerHTML =
      '<div class="chips" data-builtin></div><div class="chips" data-user></div>' +
      '<div class="row"><button class="btn small" type="button" data-save>Salva look attuale…</button>' +
      '<button class="btn small ghost" type="button" data-export>Esporta</button>' +
      '<button class="btn small ghost" type="button" data-import>Importa</button>' +
      '<input type="file" accept=".json,application/json" hidden /></div>';
    el.querySelector('[data-builtin]').innerHTML = Object.entries(BUILTIN_LOOKS)
      .map(([k, l]) => `<button type="button" class="chip" data-look="${k}">${l.name}</button>`)
      .join('');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-look]');
      if (b) applyLook(BUILTIN_LOOKS[b.dataset.look].look);
      const u = e.target.closest('[data-user-look]');
      if (u && !e.target.closest('[data-del]')) applyLook(state.userLooks[u.dataset.userLook]);
      const d = e.target.closest('[data-del]');
      if (d && confirm(`Eliminare il look «${d.dataset.del}»?`)) {
        delete state.userLooks[d.dataset.del];
        storage.set(LOOKS_KEY, state.userLooks);
        panel.sync();
      }
    });
    el.querySelector('[data-save]').addEventListener('click', () => {
      const name = prompt('Nome del look:', state.settings.title ? `Look ${state.settings.title}` : 'Il mio look');
      if (!name) return;
      state.userLooks[name.trim()] = pickLook(state.settings);
      storage.set(LOOKS_KEY, state.userLooks);
      panel.sync();
    });
    el.querySelector('[data-export]').addEventListener('click', () => {
      download(new Blob([JSON.stringify({ app: 'onda-studio', look: pickLook(state.settings) }, null, 2)], { type: 'application/json' }), 'look-onda-studio.json');
    });
    const input = el.querySelector('input[type=file]');
    el.querySelector('[data-import]').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const look = Object.fromEntries(Object.entries(data.look || data).filter(([k]) => LOOK_KEYS.includes(k)));
        const name = file.name.replace(/\.json$/i, '');
        state.userLooks[name] = look;
        storage.set(LOOKS_KEY, state.userLooks);
        applyLook(look);
      } catch (e) {
        alert(`File non valido: ${e.message}`);
      }
    });
    return () => {
      el.querySelector('[data-user]').innerHTML = Object.keys(state.userLooks)
        .map((n) => `<span class="chip user" data-user-look="${escAttr(n)}">${escHtml(n)}<button type="button" data-del="${escAttr(n)}" aria-label="Elimina">×</button></span>`)
        .join('');
    };
  },

  styles(el) {
    el.innerHTML = `<div class="styles">${Object.entries(STYLES)
      .map(([k, s]) => `<button type="button" data-value="${k}">${STYLE_ICONS[k]}<span>${s.name}<small>${s.desc}</small></span></button>`)
      .join('')}</div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (b) setSetting('style', b.dataset.value);
    });
    return (S) => {
      for (const b of el.querySelectorAll('[data-value]')) b.setAttribute('aria-pressed', String(b.dataset.value === S.style));
    };
  },

  swatches(el) {
    el.innerHTML = `<div class="swatches">${Object.entries(PALETTES)
      .map(([k, p]) => `<button type="button" class="swatch" data-palette="${k}" title="${p.name}" style="background:linear-gradient(135deg, ${p.a} 0 50%, ${p.b} 50% 100%)"></button>`)
      .join('')}</div>`;
    el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-palette]')?.dataset.palette;
      if (!k) return;
      const p = PALETTES[k];
      Object.assign(state.settings, { palette: k, colorA: p.a, colorB: p.b, colorBg: p.bg, colorBg2: p.bg2 });
      afterSettingsChange();
    });
    return (S) => {
      for (const s of el.querySelectorAll('.swatch')) s.setAttribute('aria-pressed', String(s.dataset.palette === S.palette));
    };
  },

  kickInfo(el) {
    el.className = 'note';
    return () => {
      const A = state.analysis;
      el.textContent = A
        ? `${A.kicks.length} colpi di cassa e ${A.hits.length} accenti rilevati · ${Math.round(A.bpm)} BPM`
        : 'Carica un brano per vedere i colpi rilevati.';
    };
  },

  bgImage: imagePicker('background', 'Immagine <small>(sfocata)</small>'),
  coverImage: imagePicker('cover', 'Copertina <small>(al centro)</small>'),
  logoImage: imagePicker('logo', 'Logo <small>(PNG trasparente)</small>'),

  fontUpload(el) {
    el.innerHTML =
      '<div class="row"><button class="btn small ghost" type="button">Carica un font (.ttf/.otf/.woff)…</button>' +
      '<input type="file" accept=".ttf,.otf,.woff,.woff2" hidden /></div>';
    const input = el.querySelector('input');
    el.querySelector('button').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        const face = new FontFace(name, await file.arrayBuffer());
        await face.load();
        document.fonts.add(face);
        if (!state.customFonts.includes(name)) state.customFonts.push(name);
        setSetting('font', name);
      } catch (e) {
        alert(`Non riesco a caricare questo font: ${e.message}`);
      }
    });
  },

  lyricsEditor(el) {
    el.innerHTML =
      '<textarea rows="7" spellcheck="false" placeholder="Incolla il testo, una frase per riga.&#10;Poi premi «Sincronizza» e batti Spazio all\'inizio di ogni riga mentre ascolti.&#10;&#10;Accetta anche file .lrc già sincronizzati."></textarea>' +
      '<div class="row"><button class="btn small" type="button" data-sync disabled>Sincronizza</button>' +
      '<button class="btn small ghost" type="button" data-import>Importa .lrc/.txt</button>' +
      '<button class="btn small ghost" type="button" data-export>Salva .lrc</button>' +
      '<input type="file" accept=".lrc,.txt,text/plain" hidden /></div>';
    const ta = el.querySelector('textarea');
    const syncBtn = el.querySelector('[data-sync]');
    const input = el.querySelector('input');
    ta.addEventListener('input', () => setSetting('lyrics', ta.value));
    syncBtn.addEventListener('click', () => (state.sync ? finishSync() : startSync()));
    el.querySelector('[data-import]').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      if (input.files[0]) setSetting('lyrics', await input.files[0].text());
      input.value = '';
    });
    el.querySelector('[data-export]').addEventListener('click', () => {
      const txt = state.settings.lyrics || '';
      if (txt.trim()) download(new Blob([txt], { type: 'text/plain' }), `${slug(state.settings.title)}.lrc`);
    });
    return (S) => {
      if (document.activeElement !== ta && ta.value !== S.lyrics) ta.value = S.lyrics || '';
      syncBtn.disabled = !state.audioBuffer;
      syncBtn.classList.toggle('active', !!state.sync);
      syncBtn.textContent = state.sync ? 'Termina' : 'Sincronizza';
    };
  },

  rangeEditor(el) {
    el.innerHTML =
      '<div class="range-edit">' +
      '<label class="field">Inizio <input type="text" data-k="rangeStart" inputmode="decimal" /></label>' +
      '<button class="btn small ghost" type="button" data-here="rangeStart" title="Usa la posizione attuale (tasto I)">⇤ qui</button>' +
      '<label class="field">Fine <input type="text" data-k="rangeEnd" inputmode="decimal" /></label>' +
      '<button class="btn small ghost" type="button" data-here="rangeEnd" title="Usa la posizione attuale (tasto O)">qui ⇥</button>' +
      '</div><div class="row" data-quick></div><p class="note" data-info></p>';
    el.querySelector('[data-quick]').innerHTML = [15, 30, 60]
      .map((s) => `<button class="btn small ghost" type="button" data-len="${s}">${s} s da qui</button>`)
      .join('');
    for (const input of el.querySelectorAll('input[data-k]')) {
      input.addEventListener('change', () => {
        const v = parseTime(input.value);
        if (v !== null) setSetting(input.dataset.k, v);
        else panel.sync();
      });
    }
    el.addEventListener('click', (e) => {
      const here = e.target.closest('[data-here]');
      if (here) setSetting(here.dataset.here, Math.round(player.time() * 10) / 10);
      const len = e.target.closest('[data-len]');
      if (len) {
        const start = Math.round(player.time() * 10) / 10;
        state.settings.rangeStart = start;
        setSetting('rangeEnd', start + Number(len.dataset.len));
      }
    });
    return (S) => {
      for (const input of el.querySelectorAll('input[data-k]')) {
        if (document.activeElement !== input) input.value = fmtTime(S[input.dataset.k], true);
      }
      const [rs, re] = playRange(state.analysis, S);
      el.querySelector('[data-info]').textContent = state.analysis
        ? `Estratto di ${fmtTime(re - rs, true)} · in anteprima la riproduzione resta in loop dentro l'estratto.`
        : '';
    };
  },

  exportButton(el) {
    el.innerHTML = '<button class="btn primary wide" type="button" disabled></button><p class="note"></p>';
    const btn = el.querySelector('button');
    const note = el.querySelector('.note');
    btn.addEventListener('click', startExport);
    return (S) => {
      const [w, h] = outputSize(S.format, S.resolution);
      btn.textContent = `Esporta ${S.format} · ${w}×${h}`;
      const sup = exportSupport();
      btn.disabled = !state.audioBuffer || !sup.ok;
      if (!sup.ok) {
        note.className = 'note error';
        note.textContent = "Questo browser non supporta l'esportazione video (WebCodecs). Usa Google Chrome.";
        return;
      }
      note.className = 'note';
      if (!state.audioBuffer) {
        note.textContent = 'Carica un brano per esportare.';
        return;
      }
      const [rs, re] = playRange(state.analysis, S);
      const mb = ((bitrateFor(w, h, S.fps, S.quality) / 8) * (re - rs)) / 1e6;
      note.textContent =
        `MP4 H.264 + AAC · ${fmtTime(re - rs)} · circa ${Math.round(mb)} MB.` +
        (S.resolution >= 2160 ? ' Il 4K richiede più tempo.' : '') +
        ' Per più formati, esporta, cambia formato ed esporta di nuovo.';
    };
  },
};

const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const escAttr = (s) => escHtml(s).replace(/"/g, '&quot;');

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---------- Anteprima ----------
function previewSize() {
  const f = FORMATS[state.settings.format];
  const k = state.settings.previewHD ? 1 : 0.5;
  return [Math.round(f.w * k), Math.round(f.h * k)];
}

function resizePreview() {
  const [w, h] = previewSize();
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const vp = $('#viewport');
  const pad = 48;
  const f = FORMATS[state.settings.format];
  const s = Math.min((vp.clientWidth - pad) / f.w, (vp.clientHeight - pad) / f.h);
  canvas.style.width = `${Math.max(50, Math.floor(f.w * s))}px`;
  canvas.style.height = `${Math.max(50, Math.floor(f.h * s))}px`;
  state.dirty = true;
}

let seeking = false;
function frame() {
  // In anteprima l'estratto va in loop.
  if (player.playing && !state.sync && state.settings.rangeEnabled && state.analysis) {
    const [rs, re] = playRange(state.analysis, state.settings);
    if (player.time() >= re) player.seek(rs);
  }
  if (player.playing || state.dirty) {
    const t = player.time();
    renderer.render(ctx, canvas.width, canvas.height, t, state.analysis, state.envelopes, state.settings, state.lyrics);
    state.dirty = false;
    if (state.audioBuffer) {
      $('#timeCur').textContent = fmtTime(t);
      if (!seeking) $('#seek').value = String(Math.round((t / state.audioBuffer.duration) * 1000));
    }
    if (state.sync) updateSyncOverlay();
  }
  requestAnimationFrame(frame);
}

// ---------- Immagini ----------
let imageTarget = null;
function pickImage(kind) {
  imageTarget = kind;
  $('#imageInput').click();
}
async function loadImage(file, kind) {
  const bmp = await createImageBitmap(file);
  state.images[kind] = bmp;
  renderer.setImages({ [kind]: bmp });
  afterSettingsChange();
}

// ---------- Sincronizzazione del testo ----------
function startSync() {
  const lines = plainLines(state.settings.lyrics || '');
  if (!lines.length) {
    alert('Incolla prima il testo della canzone nel riquadro (una frase per riga).');
    return;
  }
  if (hasTimestamps(state.settings.lyrics) && !confirm('Il testo è già sincronizzato. Rifare la sincronizzazione da capo?')) return;
  state.sync = { lines, idx: 0, entries: [] };
  document.activeElement?.blur();
  $('#syncOverlay').hidden = false;
  state.lyrics = [];
  player.seek(0);
  player.play();
  updateSyncOverlay();
  panel.sync();
}

function syncTap(kind) {
  const s = state.sync;
  const t = Math.round(player.time() * 100) / 100;
  if (kind === 'line') {
    if (s.idx >= s.lines.length) return;
    s.entries.push({ t, text: s.lines[s.idx++] });
  } else if (kind === 'blank') {
    s.entries.push({ t, text: '' });
  } else if (kind === 'undo') {
    const last = s.entries.pop();
    if (last?.text) s.idx--;
  }
  state.lyrics = [...s.entries];
  updateSyncOverlay();
  if (kind === 'line' && s.idx >= s.lines.length) setTimeout(() => state.sync && finishSync(), 50);
}

function finishSync() {
  const s = state.sync;
  if (!s) return;
  state.sync = null;
  $('#syncOverlay').hidden = true;
  if (s.entries.length) {
    const remaining = s.lines.slice(s.idx);
    let text = toLRC(s.entries);
    if (remaining.length) text += '\n' + remaining.join('\n');
    setSetting('lyrics', text);
  } else {
    refreshLyrics();
    panel.sync();
  }
}

function updateSyncOverlay() {
  const s = state.sync;
  if (!s) return;
  $('#syncCount').textContent = `Sincronizzazione · riga ${Math.min(s.idx + 1, s.lines.length)} di ${s.lines.length}`;
  const last = s.entries[s.entries.length - 1];
  $('#syncPrev').textContent = last ? (last.text || '— schermo vuoto —') : 'Premi Spazio quando inizia la prima riga';
  $('#syncNext').textContent = s.lines[s.idx] ?? 'Fine del testo';
}

// ---------- Esportazione ----------
let exportAbort = null;
function slug(s) {
  return (s || 'video').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'video';
}

function startExport() {
  if (!state.audioBuffer) return;
  const S = state.settings;
  const clip = S.rangeEnabled ? `_${fmtTime(S.rangeStart).replace(':', 'm')}s` : '';
  const name = `${slug(S.title)}_${S.format.replace(':', 'x')}_${S.resolution}p${clip}.mp4`;
  let handlePromise = null;
  try { handlePromise = askSaveLocation(name); } catch { handlePromise = null; }
  runExport(handlePromise, name);
}

async function runExport(handlePromise, name) {
  let fileHandle = null;
  if (handlePromise) {
    try { fileHandle = await handlePromise; } catch { return; } // l'utente ha annullato
  }
  if (state.sync) finishSync();
  player.pause();
  const S = { ...state.settings };
  const [w, h] = outputSize(S.format, S.resolution);
  const modal = $('#exportModal');
  const thumb = $('#exportThumb');
  thumb.width = w >= h ? 480 : 270;
  thumb.height = Math.round((thumb.width * h) / w);
  const tctx = thumb.getContext('2d');
  $('#exportTitle').textContent = `Esportazione ${S.format} · ${w}×${h} · ${S.fps} fps`;
  $('#exportBar').style.width = '0%';
  $('#exportPct').textContent = '0%';
  $('#exportEta').textContent = '';
  $('#exportMsg').textContent = 'Tieni questa scheda in primo piano finché non ha finito.';
  $('#exportMsg').className = 'note';
  $('#exportDownload').hidden = true;
  $('#exportCancel').textContent = 'Annulla';
  modal.hidden = false;
  exportAbort = new AbortController();

  try {
    const res = await exportVideo({
      audioBuffer: state.audioBuffer,
      analysis: state.analysis,
      envelopes: state.envelopes,
      settings: S,
      lyrics: state.lyrics,
      images: { ...state.images },
      width: w,
      height: h,
      fps: S.fps,
      quality: S.quality,
      fileHandle,
      signal: exportAbort.signal,
      onProgress: ({ done, eta, finalizing, canvas: src }) => {
        $('#exportBar').style.width = `${(done * 100).toFixed(1)}%`;
        $('#exportPct').textContent = finalizing ? 'Finalizzazione…' : `${Math.floor(done * 100)}%`;
        $('#exportEta').textContent = finalizing ? '' : `circa ${fmtTime(eta)} rimanenti`;
        tctx.drawImage(src, 0, 0, thumb.width, thumb.height);
      },
    });
    $('#exportTitle').textContent = 'Video pronto';
    $('#exportPct').textContent = '100%';
    $('#exportEta').textContent = `in ${fmtTime(res.seconds)}`;
    $('#exportCancel').textContent = 'Chiudi';
    const audioNote = res.audioCodec === 'opus' ? ' Attenzione: audio in Opus (AAC non disponibile in questo browser).' : '';
    if (res.savedTo) {
      $('#exportMsg').textContent = `Salvato come «${res.savedTo}».${audioNote}`;
    } else {
      const url = URL.createObjectURL(res.blob);
      const a = $('#exportDownload');
      a.href = url;
      a.download = name;
      a.hidden = false;
      a.click();
      $('#exportMsg').textContent = `${name} · ${(res.blob.size / 1e6).toFixed(0)} MB.${audioNote}`;
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      modal.hidden = true;
    } else {
      console.error(e);
      $('#exportTitle').textContent = 'Esportazione non riuscita';
      $('#exportMsg').textContent = e.message || String(e);
      $('#exportMsg').className = 'note error';
      $('#exportCancel').textContent = 'Chiudi';
    }
  } finally {
    exportAbort = null;
  }
}

// ---------- Schede del pannello ----------
function setTab(tab) {
  $('#panelBody').dataset.active = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  storage.set(TAB_KEY, tab);
}

// ---------- Eventi ----------
function bindEvents() {
  $('#chooseAudio').addEventListener('click', () => $('#audioInput').click());
  $('#dropHint').addEventListener('click', () => $('#audioInput').click());
  $('#audioInput').addEventListener('change', (e) => {
    loadAudioFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#imageInput').addEventListener('change', (e) => {
    if (e.target.files[0]) loadImage(e.target.files[0], imageTarget);
    e.target.value = '';
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    dragDepth++;
    $('#dragVeil').hidden = false;
  });
  window.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) { dragDepth = 0; $('#dragVeil').hidden = true; }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('#dragVeil').hidden = true;
    const file = [...(e.dataTransfer?.files || [])][0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      loadImage(file, state.settings.style === 'orbit' && !state.images.cover ? 'cover' : 'background');
    } else if (/\.(lrc|txt)$/i.test(file.name)) {
      file.text().then((txt) => setSetting('lyrics', txt));
    } else if (/\.json$/i.test(file.name)) {
      file.text().then((txt) => {
        try {
          const data = JSON.parse(txt);
          applyLook(Object.fromEntries(Object.entries(data.look || data).filter(([k]) => LOOK_KEYS.includes(k))));
        } catch { alert('File .json non valido.'); }
      });
    } else {
      loadAudioFile(file);
    }
  });

  $('#playBtn').addEventListener('click', () => player.toggle());
  canvas.addEventListener('click', () => state.audioBuffer && !state.sync && player.toggle());
  const seek = $('#seek');
  seek.addEventListener('input', () => {
    seeking = true;
    const t = (Number(seek.value) / 1000) * (state.audioBuffer?.duration || 0);
    $('#timeCur').textContent = fmtTime(t);
    player.seek(t);
  });
  seek.addEventListener('change', () => { seeking = false; });

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });

  $('#exportCancel').addEventListener('click', () => {
    if (exportAbort) exportAbort.abort();
    else $('#exportModal').hidden = true;
  });

  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !['range', 'checkbox'].includes(e.target.type);
    if (state.sync) {
      if (e.code === 'Space') { e.preventDefault(); syncTap('line'); }
      else if (e.key === 'x' || e.key === 'X') { e.preventDefault(); syncTap('blank'); }
      else if (e.key === 'Backspace') { e.preventDefault(); syncTap('undo'); }
      else if (e.key === 'Escape') { e.preventDefault(); finishSync(); }
      return;
    }
    if (typing || !state.audioBuffer || e.metaKey || e.ctrlKey) return;
    if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
    else if (e.key === 'ArrowRight') player.seek(player.time() + 5);
    else if (e.key === 'ArrowLeft') player.seek(player.time() - 5);
    else if (e.key === 'i' || e.key === 'I') { state.settings.rangeEnabled = true; setSetting('rangeStart', Math.round(player.time() * 10) / 10); }
    else if (e.key === 'o' || e.key === 'O') { state.settings.rangeEnabled = true; setSetting('rangeEnd', Math.round(player.time() * 10) / 10); }
  });

  new ResizeObserver(resizePreview).observe($('#viewport'));
}

// ---------- Avvio ----------
$('#tabs').innerHTML = TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}">${n}</button>`).join('');
panel = buildPanel($('#panelBody'), panelSchema(), {
  ctx: () => state.settings,
  set: setSetting,
  reset: (key) => setSetting(key, DEFAULT_SETTINGS[key]),
  custom,
  hasImage: (k) => !!state.images[k],
  get customFonts() { return state.customFonts; },
});
setTab(storage.get(TAB_KEY, 'look'));
bindEvents();
afterSettingsChange();
ensureFont(state.settings.font);
requestAnimationFrame(frame);

// Per test: index.html?audio=percorso/del/file.m4a
const audioParam = new URLSearchParams(location.search).get('audio');
if (audioParam) {
  fetch(audioParam)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
    .then((buf) => loadAudio(buf, decodeURIComponent(audioParam.split('/').pop())))
    .catch((e) => console.error('Caricamento audio da URL fallito', e));
}

window.__onda = { state, player, renderer, setSetting, applyLook };
