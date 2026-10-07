# Architettura

Il progetto è JavaScript puro con moduli ES: niente build, niente dipendenze npm. L'unica libreria esterna è `vendor/mp4-muxer.mjs` (licenza MIT), copiata nel repository.

## Flusso dei dati

```
file audio
   │  decodeAudioData (Web Audio, 48 kHz)
   ▼
AudioBuffer ──► analyzeAudio()  ──►  feature grezze per frame (60 fps)
                                         │
                       detectEvents()    ▼  (dipende da "Sensibilità ai colpi")
                                     colpi e accenti
                                         │
                       buildEnvelopes()  ▼  (dipende da "Morbidezza")
                                     inviluppi
                                         │
              ┌──────────────────────────┴───────────────────────┐
              ▼                                                  ▼
   Anteprima (main.js)                                  Export (exporter.js)
   renderer.render(t = tempo del player)                renderer.render(t = inizio + f / fps)
   su <canvas> a ½ o piena risoluzione                  ► VideoEncoder H.264
                                                        ► AudioEncoder AAC
                                                        ► mp4-muxer ► .mp4
```

**Principio chiave:** il renderer non ha stato. Ogni fotogramma dipende solo dal tempo `t` e dai dati precalcolati. Per questo si può saltare in qualsiasi punto del brano, e l'esportazione produce esattamente ciò che si vede in anteprima.

## Moduli (`src/`)

| File | Ruolo |
|---|---|
| `main.js` | Applicazione: stato, player Web Audio, anteprima, controlli personalizzati (look, immagini, testo, estratto), sincronizzazione del testo, avvio dell'export |
| `panel.js` | **Schema del pannello**: quali controlli ci sono, in che scheda, con quali limiti e quando sono visibili |
| `ui.js` | Costruttore generico di controlli a partire dallo schema (slider, segmenti, menu, colori, caselle) |
| `analysis.js` | Analisi audio offline: FFT, bande, colpi, BPM, beat, inviluppi |
| `renderer.js` | Disegno su Canvas 2D: sfondo, tre stili, bloom, effetti, particelle, titoli, testo, logo, dissolvenze |
| `exporter.js` | Rendering fotogramma per fotogramma, codifica WebCodecs, multiplexing MP4, estratti |
| `lyrics.js` | Parsing e scrittura dei file LRC |
| `presets.js` | Palette, stili, formati, risoluzioni, font, impostazioni predefinite e look predefiniti |

## Impostazioni e look

Tutte le opzioni vivono in un unico oggetto `settings`; i valori iniziali sono in `DEFAULT_SETTINGS` (`presets.js`). Il renderer riceve questo oggetto a ogni fotogramma e non ha altre configurazioni.

Un **look** è il sottoinsieme delle impostazioni estetiche (`LOOK_KEYS`): tutto tranne formato, titolo, artista, testo della canzone ed esportazione. Applicare un look significa ripartire dai valori predefiniti e sovrascriverli con quelli del look, così un look salvato con una versione precedente resta valido anche quando vengono aggiunte nuove opzioni.

Persistenza in `localStorage`:

| Chiave | Contenuto |
|---|---|
| `onda-studio:settings` | Ultime impostazioni (senza testo della canzone) |
| `onda-studio:looks` | Look salvati dall'utente |
| `onda-studio:lyrics:<nome file>` | Testo sincronizzato di ogni brano |
| `onda-studio:tab` | Ultima scheda aperta |

## Analisi audio (`analysis.js`)

`analyzeAudio(audioBuffer)` lavora sul segnale mono, con una FFT da 2048 campioni e finestra di Hann centrata su ogni frame (60 al secondo). Restituisce:

- **`bars`**: 96 bande in scala logaritmica da 40 Hz a 14 kHz, normalizzate 0–1. Il riferimento è in parte globale e in parte per banda, così anche gli acuti sono visibili.
- **`bands`**: energia di `sub`, `bass`, `lowmid`, `mid` e `high`.
- **`kicks`** (calcolati da `detectEvents(A, sensitivity)`): colpi di cassa, ricavati dallo spectral flux sotto i 170 Hz con peak picking adattivo. La forza di ogni colpo è pesata con il livello reale dei bassi, così i drop pesano più dei breakdown.
- **`hits`**: accenti acuti (rullante, hi-hat) tra 1,8 e 10 kHz.
- **`bpm`** e **`beats`**: tempo stimato per autocorrelazione dell'onset; la griglia dei beat è calcolata con programmazione dinamica (Ellis, 2007).
- **`mono`**: il campione grezzo, usato per gli oscilloscopi.

`buildEnvelopes(A, { smoothing })` trasforma i dati grezzi in movimento:

- barre e bande con **attacco rapido** e **rilascio regolabile** (Morbidezza);
- `pulse` e `flash`: impulsi a decadimento esponenziale sui colpi, usati per zoom, onde e lampi;
- `energy`: energia della sezione, media mobile di circa 1,5 s;
- `rot`: rotazione cumulativa, più veloce nelle parti cariche.

Ricalcolare colpi e inviluppi è immediato, quindi Sensibilità e Morbidezza si aggiornano in tempo reale.

## Rendering (`renderer.js`)

Per ogni fotogramma:

1. **Sfondo** sul canvas principale: tinta unita o sfumata, immagine sfocata (in cache) e alone centrale legato ai bassi.
2. **Primo piano** su un canvas separato, con zoom ("colpo di camera") ed eventuale vibrazione sui colpi: lo stile scelto, le particelle e le scintille.
3. **Bloom**: il primo piano viene rimpicciolito (¼ e 1/12), sfocato e risommato in modalità `lighter`.
4. **Lampo**, **vignettatura** e **grana** (4 texture di rumore che si alternano a ogni fotogramma).
5. **Titoli**, **testo** e **barra di avanzamento**, che non ricevono il bloom per restare nitidi, poi il **logo**.
6. **Dissolvenza** dal nero e verso il nero ai bordi dell'intervallo (`playRange()`).

La *Sincronia grafica* sposta solo il tempo usato per leggere l'analisi (`F.t`); testo, barra di avanzamento e dissolvenze usano il tempo reale (`F.tReal`).

I colori di ogni fotogramma passano da `prepareColors()`, che applica l'eventuale variazione di tinta, e da `colorAt(S, p, v)`, che sceglie il colore di una barra in base alla modalità (frequenza, intensità, unico).

Tutte le misure sono espresse in `u = min(larghezza, altezza) / 1080`, così lo stesso codice funziona a qualsiasi risoluzione e formato. Le posizioni per formato e stile sono definite in `layout()`.

Le particelle sono deterministiche: posizione e colore derivano da un generatore pseudo-casuale con seme (`rand(seed)`) e dal tempo trascorso dal colpo.

## Esportazione (`exporter.js`)

- Sceglie il primo profilo H.264 supportato (High 5.2 per il 4K60 → High 5.1 → Main → Baseline) e l'AAC a 256 kbps. Se l'AAC non è disponibile, ripiega su Opus.
- Per ogni fotogramma: `render()` su un canvas dedicato, `new VideoFrame(canvas)` e `encode()`. L'audio viene codificato a blocchi in parallelo, così le tracce restano intercalate.
- Se la coda dell'encoder supera 4 fotogrammi, aspetta (backpressure), per non saturare la memoria.
- Con un estratto attivo, rende solo i fotogrammi tra inizio e fine, ritaglia l'audio e applica le dissolvenze anche al suono (o 10 ms anti-click se non ci sono).
- Prima di iniziare attende il caricamento dei font web, altrimenti i primi fotogrammi userebbero il font di riserva.
- In Chrome (`showSaveFilePicker`) il file viene scritto direttamente su disco, con spazio riservato per i metadati (fast start). Altrimenti l'MP4 viene costruito in memoria e scaricato.

## Come estendere

### Aggiungere un'opzione

1. Aggiungi la chiave con il valore predefinito in `DEFAULT_SETTINGS` (`presets.js`). Se è estetica, entrerà automaticamente nei look.
2. Aggiungi il controllo nello schema di `panel.js`, ad esempio:
   ```js
   { type: 'range', key: 'miaOpzione', label: 'Mia opzione', min: 0, max: 1, step: 0.05, fmt: fmt.pct, when: (S) => S.style === 'orbit' }
   ```
   Tipi disponibili: `range`, `check`, `seg`, `select`, `colors`, `text`, `custom`, `note`.
3. Usala nel renderer leggendo `S.miaOpzione`.

### Aggiungere uno stile

1. In `presets.js` aggiungi la voce in `STYLES`, ad esempio `spiral: { name: 'Spirale', desc: '…' }`.
2. In `renderer.js` scrivi `drawSpiral(g, L, F, A, E, S)`. `F` contiene i valori del frame corrente: `bass`, `pulse`, `flash`, `energy`, `high`, `rot`, `react`, `t`, `i`.
3. Collegalo in `render()`, accanto a `drawOrbit`, `drawHorizon` e `drawWave`, e definisci il layout in `layout()`.
4. In `main.js` aggiungi un'icona in `STYLE_ICONS`; le opzioni specifiche vanno in `panel.js` con `when: (S) => S.style === 'spiral'`.

### Aggiungere una palette

Aggiungi una voce in `PALETTES` (`presets.js`): il pulsante compare in automatico.

### Testo parola per parola (karaoke)

L'animazione *Karaoke* oggi stima la velocità dalla lunghezza della riga. Il formato LRC "enhanced" (`<mm:ss.xx>` prima di ogni parola) è lo sviluppo naturale. Si tratta di estendere `parseLyrics()` per leggere i tempi delle parole e `drawLyrics()` per evidenziarle.

## Test

Si può caricare un brano tramite URL, comodo per i test automatici. Il file deve trovarsi dentro la cartella del progetto:

```
http://localhost:8765/?audio=percorso/file.mp3
```

Dalla console del browser, `window.__onda` dà accesso a `state`, `player`, `renderer`, `setSetting(chiave, valore)` e `applyLook(look)`.
