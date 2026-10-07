# Architettura

Il progetto è JavaScript puro con moduli ES: niente build, niente dipendenze npm. L'unica libreria esterna è `vendor/mp4-muxer.mjs` (licenza MIT), copiata nel repository.

## Flusso dei dati

```
file audio
   │  decodeAudioData (Web Audio, 48 kHz)
   ▼
AudioBuffer ──► analyzeAudio()  ──►  feature grezze per frame (60 fps)
                                         │
                       buildEnvelopes()  ▼  (dipende da "Morbidezza")
                                     inviluppi
                                         │
              ┌──────────────────────────┴───────────────────────┐
              ▼                                                  ▼
   Anteprima (main.js)                                  Export (exporter.js)
   renderer.render(t = tempo del player)                renderer.render(t = f / fps)
   su <canvas> a ½ o piena risoluzione                  ► VideoEncoder H.264
                                                        ► AudioEncoder AAC
                                                        ► mp4-muxer ► .mp4
```

**Principio chiave:** il renderer non ha stato. Ogni fotogramma dipende solo dal tempo `t` e dai dati precalcolati. Per questo si può saltare in qualsiasi punto del brano, e l'esportazione produce esattamente ciò che si vede in anteprima.

## Moduli (`src/`)

| File | Ruolo |
|---|---|
| `main.js` | Interfaccia: stato, controlli, player Web Audio, anteprima, sincronizzazione del testo, avvio dell'export |
| `analysis.js` | Analisi audio offline: FFT, bande, colpi, BPM, beat, inviluppi |
| `renderer.js` | Disegno su Canvas 2D: sfondo, tre stili, bloom, particelle, titoli, testo, barra di avanzamento |
| `exporter.js` | Rendering fotogramma per fotogramma, codifica WebCodecs, multiplexing MP4 |
| `lyrics.js` | Parsing e scrittura dei file LRC |
| `presets.js` | Palette, stili, formati, font e impostazioni predefinite |

## Analisi audio (`analysis.js`)

`analyzeAudio(audioBuffer)` lavora sul segnale mono, con una FFT da 2048 campioni e finestra di Hann centrata su ogni frame (60 al secondo). Restituisce:

- **`bars`**: 96 bande in scala logaritmica da 40 Hz a 14 kHz, normalizzate 0–1. Il riferimento è in parte globale e in parte per banda, così anche gli acuti sono visibili.
- **`bands`**: energia di `sub`, `bass`, `lowmid`, `mid` e `high`.
- **`kicks`**: colpi di cassa, ricavati dallo spectral flux sotto i 170 Hz con peak picking adattivo. La forza di ogni colpo è pesata con il livello reale dei bassi, così i drop pesano più dei breakdown.
- **`hits`**: accenti acuti (rullante, hi-hat) tra 1,8 e 10 kHz.
- **`bpm`** e **`beats`**: tempo stimato per autocorrelazione dell'onset; la griglia dei beat è calcolata con programmazione dinamica (Ellis, 2007).
- **`mono`**: il campione grezzo, usato per gli oscilloscopi.

`buildEnvelopes(A, { smoothing })` trasforma i dati grezzi in movimento:

- barre e bande con **attacco rapido** e **rilascio regolabile** (Morbidezza);
- `pulse` e `flash`: impulsi a decadimento esponenziale sui colpi, usati per zoom, onde e lampi;
- `energy`: energia della sezione, media mobile di circa 1,5 s;
- `rot`: rotazione cumulativa, più veloce nelle parti cariche.

Ricalcolare gli inviluppi è immediato, quindi Morbidezza si aggiorna in tempo reale.

## Rendering (`renderer.js`)

Per ogni fotogramma:

1. **Sfondo** sul canvas principale: colore, immagine sfocata e alone centrale legato ai bassi.
2. **Primo piano** su un canvas separato, con un leggero zoom sui colpi: lo stile scelto, le particelle e le scintille.
3. **Bloom**: il primo piano viene rimpicciolito (¼ e 1/12), sfocato e risommato in modalità `lighter`.
4. **Vignettatura**, poi **titoli**, **testo** e **barra di avanzamento**, che non ricevono il bloom per restare nitidi.

Tutte le misure sono espresse in `u = min(larghezza, altezza) / 1080`, così lo stesso codice funziona a qualsiasi risoluzione e formato. Le posizioni per formato e stile sono definite in `layout()`.

Le particelle sono deterministiche: posizione e colore derivano da un generatore pseudo-casuale con seme (`rand(seed)`) e dal tempo trascorso dal colpo.

## Esportazione (`exporter.js`)

- Sceglie il primo profilo H.264 supportato (High 5.1 → Main → Baseline) e l'AAC a 256 kbps. Se l'AAC non è disponibile, ripiega su Opus.
- Per ogni fotogramma: `render()` su un canvas dedicato, `new VideoFrame(canvas)` e `encode()`. L'audio viene codificato a blocchi in parallelo, così le tracce restano intercalate.
- Se la coda dell'encoder supera 4 fotogrammi, aspetta (backpressure), per non saturare la memoria.
- In Chrome (`showSaveFilePicker`) il file viene scritto direttamente su disco, con spazio riservato per i metadati (fast start). Altrimenti l'MP4 viene costruito in memoria e scaricato.

## Come estendere

### Aggiungere uno stile

1. In `presets.js` aggiungi la voce in `STYLES`, ad esempio `spiral: { name: 'Spirale', desc: '…' }`.
2. In `renderer.js` scrivi `drawSpiral(g, L, F, A, E, S)`. `F` contiene i valori del frame corrente: `bass`, `pulse`, `flash`, `energy`, `high`, `rot`, `react`, `t`, `i`.
3. Collegalo in `render()`, accanto a `drawOrbit`, `drawHorizon` e `drawWave`, e definisci il layout in `layout()`.
4. In `main.js` aggiungi un'icona in `STYLE_ICONS`.

### Aggiungere una palette

Aggiungi una voce in `PALETTES` (`presets.js`): il pulsante compare in automatico.

### Testo parola per parola (karaoke)

Il formato LRC "enhanced" (`<mm:ss.xx>` prima di ogni parola) è lo sviluppo naturale. Si tratta di estendere `parseLyrics()` per leggere i tempi delle parole e `drawLyrics()` per evidenziarle.

## Test

Si può caricare un brano tramite URL, comodo per i test automatici. Il file deve trovarsi dentro la cartella del progetto:

```
http://localhost:8765/?audio=percorso/file.mp3
```

Dalla console del browser, `window.__onda` dà accesso a `state`, `player` e `renderer`.
