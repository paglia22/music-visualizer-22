import { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } from '../vendor/mp4-muxer.mjs';
import { Renderer, playRange } from './renderer.js';

// Dal più capace al più compatibile: High 5.2 (4K60) → High 5.1 → Main → Baseline.
const VIDEO_CODECS = ['avc1.640034', 'avc1.640033', 'avc1.4d0033', 'avc1.640028', 'avc1.42e033'];

export function exportSupport() {
  const missing = ['VideoEncoder', 'AudioEncoder', 'VideoFrame', 'AudioData'].filter((k) => !(k in window));
  return { ok: missing.length === 0, missing };
}

export function bitrateFor(w, h, fps, quality) {
  const px = (w * h) / (1920 * 1080);
  const base = quality === 'high' ? 14e6 : 8e6;
  // Crescita meno che lineare con i pixel: il 4K non ha bisogno di 4× i bit del 1080p.
  return Math.round(base * Math.pow(px, 0.85) * (fps >= 50 ? 1 : 0.65));
}

async function pickVideoConfig(w, h, fps, bitrate) {
  for (const codec of VIDEO_CODECS) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
      const cfg = { codec, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration, avc: { format: 'avc' } };
      try {
        const res = await VideoEncoder.isConfigSupported(cfg);
        if (res.supported) return cfg;
      } catch { /* prova il successivo */ }
    }
  }
  throw new Error(`Il browser non supporta la codifica H.264 a ${w}×${h} ${fps} fps. Prova una risoluzione più bassa o 30 fps.`);
}

async function pickAudioConfig(sampleRate, numberOfChannels) {
  const aac = { codec: 'mp4a.40.2', sampleRate, numberOfChannels, bitrate: 256000 };
  if ((await AudioEncoder.isConfigSupported(aac)).supported) return { cfg: aac, mux: 'aac' };
  const opus = { codec: 'opus', sampleRate, numberOfChannels, bitrate: 192000 };
  if ((await AudioEncoder.isConfigSupported(opus)).supported) return { cfg: opus, mux: 'opus' };
  throw new Error('Il browser non supporta la codifica audio AAC/Opus.');
}

/**
 * Chiede dove salvare (Chrome) PRIMA di ogni await, così vale ancora il click dell'utente.
 * Ritorna un handle oppure null (si userà il download classico).
 */
export function askSaveLocation(suggestedName) {
  if (!('showSaveFilePicker' in window)) return null;
  return window
    .showSaveFilePicker({ suggestedName, types: [{ description: 'Video MP4', accept: { 'video/mp4': ['.mp4'] } }] })
    .catch((e) => {
      if (e.name === 'AbortError') throw e;
      return null;
    });
}

/**
 * Esporta il video. opts: { audioBuffer, analysis, envelopes, settings, lyrics, images,
 *   width, height, fps, quality, fileHandle, onProgress, signal }
 * Se settings.rangeEnabled, esporta solo l'estratto [rangeStart, rangeEnd].
 * Ritorna { blob } (download classico) oppure { savedTo } (salvato su disco).
 */
export async function exportVideo(opts) {
  const { audioBuffer, analysis: A, envelopes: E, settings: S, lyrics, images, width, height, fps, quality, fileHandle, onProgress, signal } = opts;
  const [rangeStart, rangeEnd] = playRange(A, S);
  const duration = rangeEnd - rangeStart;
  const totalFrames = Math.ceil(duration * fps);
  const bitrate = bitrateFor(width, height, fps, quality);
  const sampleRate = audioBuffer.sampleRate;
  const channels = Math.min(2, audioBuffer.numberOfChannels);

  // I font web devono essere pronti prima di disegnare il testo sul canvas.
  if (document.fonts) {
    await Promise.all([
      document.fonts.load(`600 40px "${S.font}"`),
      document.fonts.load(`${S.lyricsWeight} 40px "${S.font}"`),
      document.fonts.load(`500 40px "${S.font}"`),
    ]).catch(() => {});
  }

  const videoCfg = await pickVideoConfig(width, height, fps, bitrate);
  const audio = await pickAudioConfig(sampleRate, channels);

  let writable = null;
  let target;
  if (fileHandle) {
    writable = await fileHandle.createWritable();
    target = new FileSystemWritableFileStreamTarget(writable);
  } else {
    target = new ArrayBufferTarget();
  }
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: { codec: audio.mux, numberOfChannels: channels, sampleRate },
    fastStart: fileHandle
      ? { expectedVideoChunks: totalFrames + 16, expectedAudioChunks: Math.ceil((duration * sampleRate) / 960) + 64 }
      : 'in-memory',
    firstTimestampBehavior: 'cross-track-offset',
  });

  let failure = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  videoEncoder.configure(videoCfg);
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { failure = e; },
  });
  audioEncoder.configure(audio.cfg);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  const renderer = new Renderer();
  renderer.setImages(images);

  // Audio dell'estratto, in blocchi intercalati con il video, con dissolvenze ai bordi.
  const chData = [];
  for (let c = 0; c < channels; c++) chData.push(audioBuffer.getChannelData(c));
  const firstSample = Math.round(rangeStart * sampleRate);
  const totalSamples = Math.min(audioBuffer.length - firstSample, Math.round(duration * sampleRate));
  // Anche senza dissolvenza, 10 ms evitano il "click" di un taglio a metà brano.
  const fadeInS = Math.max(S.rangeEnabled && rangeStart > 0 ? 0.01 : 0, S.fadeIn) * sampleRate;
  const fadeOutS = Math.max(S.rangeEnabled && rangeEnd < A.duration ? 0.01 : 0, S.fadeOut) * sampleRate;
  const gainAt = (n) => {
    let g = 1;
    if (fadeInS > 0 && n < fadeInS) g = Math.min(g, n / fadeInS);
    if (fadeOutS > 0 && totalSamples - n < fadeOutS) g = Math.min(g, (totalSamples - n) / fadeOutS);
    return g * g;
  };
  const AUDIO_BLOCK = 4096;
  let audioPos = 0;
  const encodeAudioUntil = (sampleEnd) => {
    sampleEnd = Math.min(sampleEnd, totalSamples);
    while (audioPos < sampleEnd) {
      const n = Math.min(AUDIO_BLOCK, totalSamples - audioPos);
      const planar = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) {
        const src = chData[c];
        const o = c * n;
        for (let s = 0; s < n; s++) planar[o + s] = src[firstSample + audioPos + s] * gainAt(audioPos + s);
      }
      const data = new AudioData({
        format: 'f32-planar', sampleRate, numberOfFrames: n, numberOfChannels: channels,
        timestamp: Math.round((audioPos / sampleRate) * 1e6), data: planar,
      });
      audioEncoder.encode(data);
      data.close();
      audioPos += n;
    }
  };

  const started = performance.now();
  const frameDur = Math.round(1e6 / fps);
  try {
    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) throw new DOMException('Esportazione annullata', 'AbortError');
      if (failure) throw failure;
      const t = f / fps;
      renderer.render(ctx, width, height, rangeStart + t, A, E, S, lyrics);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: frameDur });
      videoEncoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
      frame.close();
      encodeAudioUntil(Math.ceil(((f + 1) / fps) * sampleRate));

      if (videoEncoder.encodeQueueSize > 4) {
        await new Promise((r) => videoEncoder.addEventListener('dequeue', r, { once: true }));
      }
      if (f % 10 === 0) {
        const elapsed = (performance.now() - started) / 1000;
        const done = (f + 1) / totalFrames;
        onProgress?.({ frame: f + 1, totalFrames, done, eta: (elapsed / done) * (1 - done), canvas });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    encodeAudioUntil(totalSamples);
    onProgress?.({ frame: totalFrames, totalFrames, done: 1, eta: 0, finalizing: true, canvas });
    await videoEncoder.flush();
    await audioEncoder.flush();
    if (failure) throw failure;
    muxer.finalize();
  } catch (e) {
    try { videoEncoder.close(); } catch {}
    try { audioEncoder.close(); } catch {}
    if (writable) await writable.abort().catch(() => {});
    throw e;
  }
  videoEncoder.close();
  audioEncoder.close();

  const info = { codec: videoCfg.codec, audioCodec: audio.mux, bitrate, seconds: (performance.now() - started) / 1000 };
  if (writable) {
    await writable.close();
    return { savedTo: fileHandle.name, ...info };
  }
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), ...info };
}
