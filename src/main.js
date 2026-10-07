import { analyzeAudio, buildEnvelopes } from './analysis.js';
import { Renderer } from './renderer.js';
import { exportVideo, exportSupport, askSaveLocation, bitrateFor } from './exporter.js';
import { parseLyrics, plainLines, toLRC, hasTimestamps } from './lyrics.js';
import { PALETTES, STYLES, FORMATS, FONTS, DEFAULT_SETTINGS } from './presets.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const STORE_KEY = 'onda-studio:settings';

// ---------- Stato ----------
const state = {
  settings: loadSettings(),
  fileName: '',
  audioBuffer: null,
  analysis: null,
  envelopes: null,
  lyrics: [],
  images: { cover: null, background: null },
  sync: null,
  dirty: true,
};
const renderer = new Renderer();
const canvas = $('#preview');
const ctx = canvas.getContext('2d', { alpha: false });

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...saved, lyrics: '' };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
let saveTimer;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { lyrics, ...rest } = state.settings;
      localStorage.setItem(STORE_KEY, JSON.stringify(rest));
      if (state.fileName) localStorage.setItem(`onda-studio:lyrics:${state.fileName}`, lyrics);
    } catch { /* storage non disponibile */ }
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
    state.envelopes = buildEnvelopes(A, { smoothing: state.settings.smoothing });

    state.settings.title = prettyTitle(name);
    let savedLyrics = '';
    try { savedLyrics = localStorage.getItem(`onda-studio:lyrics:${name}`) || ''; } catch {}
    state.settings.lyrics = savedLyrics;
    syncControls();
    refreshLyrics();

    $('#trackMeta').textContent = name;
    $('#stats').innerHTML =
      `<span>Durata <b>${fmt(buf.duration)}</b></span><span>BPM <b>${Math.round(A.bpm)}</b></span>` +
      `<span>Colpi rilevati <b>${A.kicks.length}</b></span><span><b>${buf.sampleRate / 1000} kHz</b> · ${buf.numberOfChannels === 1 ? 'mono' : 'stereo'}</span>`;
    $('#dropHint').hidden = true;
    $('#playBtn').disabled = false;
    $('#seek').disabled = false;
    $('#syncBtn').disabled = false;
    $('#exportBtn').disabled = !exportSupport().ok;
    hideBusy();
    updateTransport();
    updateExportNote();
    state.dirty = true;
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

function showBusy(label, p) {
  $('#busy').hidden = false;
  $('#busyLabel').textContent = label;
  $('#busyBar').style.width = `${Math.round(p * 100)}%`;
}
function hideBusy() { $('#busy').hidden = true; }

// ---------- Controlli ----------
const fmt = (t) => {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  return `${m}:${String(Math.floor(t - m * 60)).padStart(2, '0')}`;
};

const STYLE_ICONS = {
  orbit: '<svg viewBox="0 0 34 34" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="17" cy="17" r="7"/><path d="M17 6v-3M17 31v-3M6 17H3M31 17h-3M9.2 9.2 7 7M27 27l-2.2-2.2M9.2 24.8 7 27M27 7l-2.2 2.2" stroke-linecap="round"/></svg>',
  horizon: '<svg viewBox="0 0 34 34" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 17h28"/><path d="M15 15V7M19 15V7M11 15v-5M23 15v-5M7 15v-3M27 15v-3" /><path d="M15 19v4M19 19v4M11 19v2M23 19v2" opacity=".45"/></svg>',
  wave: '<svg viewBox="0 0 34 34" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 17c4 0 5-9 9-9s5 18 9 18 5-9 10-9"/><path d="M3 17c4 0 6-5 9-5s6 10 9 10 6-5 10-5" opacity=".45"/></svg>',
};

function buildControls() {
  $('#formatSeg').innerHTML = Object.entries(FORMATS)
    .map(([k, f]) => `<button type="button" data-value="${k}">${f.name}<small>${f.hint}</small></button>`)
    .join('');
  $('#styleSeg').innerHTML = Object.entries(STYLES)
    .map(([k, s]) => `<button type="button" data-value="${k}">${STYLE_ICONS[k]}<span>${s.name}<small>${s.desc}</small></span></button>`)
    .join('');
  $('#fpsSeg').innerHTML = [30, 60].map((f) => `<button type="button" data-value="${f}">${f} fps<small>${f === 60 ? 'più fluido' : 'più veloce'}</small></button>`).join('');
  $('#qualitySeg').innerHTML = [['standard', 'Standard'], ['high', 'Alta']]
    .map(([k, n]) => `<button type="button" data-value="${k}">${n}<small>qualità</small></button>`)
    .join('');
  $('#swatches').innerHTML = Object.entries(PALETTES)
    .map(([k, p]) => `<button type="button" class="swatch" data-palette="${k}" title="${p.name}" style="background:linear-gradient(135deg, ${p.a} 0 50%, ${p.b} 50% 100%)"></button>`)
    .join('');
  $('#fontSelect').innerHTML = FONTS.map((f) => `<option value="${f}" style="font-family:'${f}'">${f}</option>`).join('');

  // Segmenti
  for (const seg of $$('.seg[data-setting], .styles[data-setting]')) {
    const key = seg.dataset.setting;
    seg.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-value]');
      if (!btn) return;
      const raw = btn.dataset.value;
      setSetting(key, key === 'fps' ? Number(raw) : raw);
    });
  }
  // Input generici
  for (const el of $$('input[data-setting], select[data-setting], textarea[data-setting]')) {
    const key = el.dataset.setting;
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      setSetting(key, v, { fromInput: true });
    });
  }
  $('#swatches').addEventListener('click', (e) => {
    const k = e.target.closest('[data-palette]')?.dataset.palette;
    if (!k) return;
    const p = PALETTES[k];
    Object.assign(state.settings, { palette: k, colorA: p.a, colorB: p.b, colorBg: p.bg });
    afterSettingsChange();
  });
}

function setSetting(key, value, { fromInput = false } = {}) {
  state.settings[key] = value;
  if (key === 'colorA' || key === 'colorB' || key === 'colorBg') state.settings.palette = '';
  if (key === 'smoothing' && state.analysis) state.envelopes = buildEnvelopes(state.analysis, { smoothing: value });
  if (key === 'lyrics') refreshLyrics();
  afterSettingsChange(fromInput ? key : null);
}

function afterSettingsChange(skipKey = null) {
  syncControls(skipKey);
  resizePreview();
  updateExportNote();
  saveSettings();
  state.dirty = true;
}

function syncControls(skipKey = null) {
  const S = state.settings;
  for (const seg of $$('.seg[data-setting], .styles[data-setting]')) {
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.value === String(S[seg.dataset.setting])));
  }
  for (const el of $$('input[data-setting], select[data-setting], textarea[data-setting]')) {
    const key = el.dataset.setting;
    if (key === skipKey) continue;
    if (el.type === 'checkbox') el.checked = !!S[key];
    else el.value = S[key] ?? '';
  }
  for (const o of $$('output[data-for]')) {
    const v = S[o.dataset.for];
    o.textContent = o.dataset.for === 'smoothing' || o.dataset.for === 'bloom' ? `${Math.round(v * 100)}%` : `${v.toFixed(2)}×`;
  }
  for (const s of $$('.swatch')) s.setAttribute('aria-pressed', String(s.dataset.palette === S.palette));
  document.documentElement.style.setProperty('--accent', S.colorA);
  document.documentElement.style.setProperty('--accent-2', S.colorB);
}

function refreshLyrics() {
  const src = state.settings.lyrics || '';
  const { lines, meta } = parseLyrics(src);
  state.lyrics = lines;
  if (meta.ti && !state.settings.title) state.settings.title = meta.ti;
  if (meta.ar && !state.settings.artist) state.settings.artist = meta.ar;
  const badge = $('#lyricsBadge');
  if (!src.trim()) badge.textContent = '';
  else if (lines.length) badge.textContent = `${lines.filter((l) => l.text).length} righe a tempo`;
  else badge.textContent = 'da sincronizzare';
  state.dirty = true;
}

function updateTransport() {
  const dur = state.audioBuffer?.duration || 0;
  $('#playBtn').classList.toggle('playing', player.playing);
  $('#playBtn').setAttribute('aria-label', player.playing ? 'Pausa' : 'Riproduci');
  $('#timeDur').textContent = fmt(dur);
}

function updateExportNote() {
  const note = $('#exportNote');
  const sup = exportSupport();
  const f = FORMATS[state.settings.format];
  $('#exportBtn').textContent = `Esporta ${f.name} · ${f.w}×${f.h}`;
  if (!sup.ok) {
    note.className = 'note error';
    note.textContent = 'Questo browser non supporta l\'esportazione video (WebCodecs). Usa Google Chrome.';
    return;
  }
  note.className = 'note';
  if (!state.audioBuffer) {
    note.textContent = 'Carica un brano per esportare.';
    return;
  }
  const br = bitrateFor(f.w, f.h, state.settings.fps, state.settings.quality);
  const mb = ((br / 8) * state.audioBuffer.duration) / 1e6;
  note.textContent = `MP4 H.264 + AAC · circa ${Math.round(mb)} MB. Per avere entrambi i formati, esporta, cambia formato ed esporta di nuovo.`;
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
  const maxW = vp.clientWidth - pad, maxH = vp.clientHeight - pad;
  const f = FORMATS[state.settings.format];
  const s = Math.min(maxW / f.w, maxH / f.h);
  canvas.style.width = `${Math.max(50, Math.floor(f.w * s))}px`;
  canvas.style.height = `${Math.max(50, Math.floor(f.h * s))}px`;
  state.dirty = true;
}

function frame() {
  if (player.playing || state.dirty) {
    const t = player.time();
    renderer.render(ctx, canvas.width, canvas.height, t, state.analysis, state.envelopes, state.settings, state.lyrics);
    state.dirty = false;
    if (state.audioBuffer) {
      $('#timeCur').textContent = fmt(t);
      if (!seeking) $('#seek').value = String(Math.round((t / state.audioBuffer.duration) * 1000));
    }
    if (state.sync) updateSyncOverlay();
  }
  requestAnimationFrame(frame);
}

// ---------- Immagini ----------
let imageTarget = null;
async function loadImage(file) {
  const bmp = await createImageBitmap(file);
  state.images[imageTarget] = bmp;
  renderer.setImages({ [imageTarget]: bmp });
  $(`[data-image-clear="${imageTarget}"]`).hidden = false;
  state.dirty = true;
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
  $('#syncBtn').classList.add('active');
  state.lyrics = [];
  player.seek(0);
  player.play();
  updateSyncOverlay();
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
  $('#syncBtn').classList.remove('active');
  if (s.entries.length) {
    const remaining = s.lines.slice(s.idx);
    let text = toLRC(s.entries);
    if (remaining.length) text += '\n' + remaining.join('\n');
    state.settings.lyrics = text;
    refreshLyrics();
    syncControls();
    saveSettings();
  } else {
    refreshLyrics();
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
  const f = FORMATS[state.settings.format];
  const name = `${slug(state.settings.title)}_${f.name.replace(':', 'x')}.mp4`;
  let handlePromise = null;
  try { handlePromise = askSaveLocation(name); } catch { handlePromise = null; }
  runExport(handlePromise, name, f);
}

async function runExport(handlePromise, name, f) {
  let fileHandle = null;
  if (handlePromise) {
    try { fileHandle = await handlePromise; } catch { return; } // l'utente ha annullato
  }
  if (state.sync) finishSync();
  player.pause();
  const modal = $('#exportModal');
  const thumb = $('#exportThumb');
  thumb.width = f.w >= f.h ? 480 : 270;
  thumb.height = Math.round((thumb.width * f.h) / f.w);
  const tctx = thumb.getContext('2d');
  $('#exportTitle').textContent = `Esportazione ${f.name} · ${f.w}×${f.h} · ${state.settings.fps} fps`;
  $('#exportBar').style.width = '0%';
  $('#exportPct').textContent = '0%';
  $('#exportEta').textContent = '';
  $('#exportMsg').textContent = 'Non chiudere questa scheda finché non ha finito.';
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
      settings: { ...state.settings },
      lyrics: state.lyrics,
      images: { ...state.images },
      width: f.w,
      height: f.h,
      fps: state.settings.fps,
      quality: state.settings.quality,
      fileHandle,
      signal: exportAbort.signal,
      onProgress: ({ done, eta, finalizing, canvas: src }) => {
        $('#exportBar').style.width = `${(done * 100).toFixed(1)}%`;
        $('#exportPct').textContent = finalizing ? 'Finalizzazione…' : `${Math.floor(done * 100)}%`;
        $('#exportEta').textContent = finalizing ? '' : `circa ${fmt(eta)} rimanenti`;
        tctx.drawImage(src, 0, 0, thumb.width, thumb.height);
      },
    });
    $('#exportTitle').textContent = 'Video pronto';
    $('#exportPct').textContent = '100%';
    $('#exportEta').textContent = `in ${fmt(res.seconds)}`;
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

// ---------- Eventi ----------
let seeking = false;
function bindEvents() {
  $('#chooseAudio').addEventListener('click', () => $('#audioInput').click());
  $('#dropHint').addEventListener('click', () => $('#audioInput').click());
  $('#audioInput').addEventListener('change', (e) => {
    loadAudioFile(e.target.files[0]);
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
      imageTarget = state.settings.style === 'orbit' && !state.images.cover ? 'cover' : 'background';
      loadImage(file);
    } else if (/\.(lrc|txt)$/i.test(file.name)) {
      file.text().then((txt) => setSetting('lyrics', txt));
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
    $('#timeCur').textContent = fmt(t);
    player.seek(t);
  });
  seek.addEventListener('change', () => { seeking = false; });

  for (const b of $$('[data-image-pick]')) {
    b.addEventListener('click', () => {
      imageTarget = b.dataset.imagePick;
      $('#imageInput').click();
    });
  }
  $('#imageInput').addEventListener('change', (e) => {
    if (e.target.files[0]) loadImage(e.target.files[0]);
    e.target.value = '';
  });
  for (const b of $$('[data-image-clear]')) {
    b.addEventListener('click', () => {
      const k = b.dataset.imageClear;
      state.images[k] = null;
      renderer.setImages({ [k]: null });
      b.hidden = true;
      state.dirty = true;
    });
  }

  $('#syncBtn').addEventListener('click', () => (state.sync ? finishSync() : startSync()));
  $('#lrcImport').addEventListener('click', () => $('#lrcInput').click());
  $('#lrcInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) setSetting('lyrics', await file.text());
    e.target.value = '';
  });
  $('#lrcExport').addEventListener('click', () => {
    const txt = state.settings.lyrics || '';
    if (!txt.trim()) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    a.download = `${slug(state.settings.title)}.lrc`;
    a.click();
  });

  $('#exportBtn').addEventListener('click', startExport);
  $('#exportCancel').addEventListener('click', () => {
    if (exportAbort) exportAbort.abort();
    else $('#exportModal').hidden = true;
  });

  window.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range';
    if (state.sync) {
      if (e.code === 'Space') { e.preventDefault(); syncTap('line'); }
      else if (e.key === 'x' || e.key === 'X') { e.preventDefault(); syncTap('blank'); }
      else if (e.key === 'Backspace') { e.preventDefault(); syncTap('undo'); }
      else if (e.key === 'Escape') { e.preventDefault(); finishSync(); }
      return;
    }
    if (typing || !state.audioBuffer) return;
    if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
    else if (e.key === 'ArrowRight') player.seek(player.time() + 5);
    else if (e.key === 'ArrowLeft') player.seek(player.time() - 5);
  });

  new ResizeObserver(resizePreview).observe($('#viewport'));
}

// ---------- Avvio ----------
buildControls();
syncControls();
bindEvents();
resizePreview();
updateExportNote();
requestAnimationFrame(frame);

// Per test: index.html?audio=percorso/del/file.m4a
const audioParam = new URLSearchParams(location.search).get('audio');
if (audioParam) {
  fetch(audioParam)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
    .then((buf) => loadAudio(buf, decodeURIComponent(audioParam.split('/').pop())))
    .catch((e) => console.error('Caricamento audio da URL fallito', e));
}

window.__onda = { state, player, renderer };
