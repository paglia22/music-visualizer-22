# Guida all'uso

## Flusso di lavoro

1. **Carica il brano**: trascinalo nella finestra oppure usa *Scegli file audio…*. Sono supportati MP3, WAV, M4A, FLAC, OGG e Opus. L'analisi richiede pochi secondi; poi compaiono durata, BPM e numero di colpi rilevati.
2. Regola il video nelle quattro schede del pannello: **Stile**, **Scena**, **Testi**, **Esporta**.
3. Controlla il risultato nell'anteprima (`Spazio` per play/pausa) ed **esporta**.

Il titolo viene preso dal nome del file, togliendo il numero di traccia: `2. Raggi di Fuoco.m4a` diventa "Raggi di Fuoco".

> **Suggerimento:** fai doppio clic su uno slider per riportarlo al valore predefinito.

---

## Scheda Stile

### Look

Un *look* è l'insieme delle scelte estetiche: stile, forma, colori, dinamica, sfondo, effetti e aspetto dei testi. Non comprende i contenuti (titolo, testo della canzone) né le impostazioni di esportazione.

| Look predefinito | Carattere |
|---|---|
| **Elegante** | I valori di partenza: misurato, caldo |
| **Club** | Scatti secchi, lampi, vibrazione, rotazione, colori accesi |
| **Morbido** | Movimenti fluidi, toni neutri, sfondo sfumato, grana |
| **Neon** | Molto bagliore, colori freddi che cambiano tinta, testo karaoke |

- **Salva look attuale…** lo memorizza con un nome; compare tra i chip tratteggiati (× per eliminarlo).
- **Esporta** / **Importa** salvano e caricano il look in un file `.json`, utile per usare lo stesso stile su tutti i brani di un album o per condividerlo. Si può anche trascinare il `.json` nella finestra.

### Formato

| Formato | Risoluzione a 1080p | Per |
|---|---|---|
| 16:9 | 1920×1080 | YouTube |
| 9:16 | 1080×1920 | Reels, TikTok, Shorts, Storie |
| 4:5 | 1080×1350 | Feed di Instagram |
| 1:1 | 1080×1080 | Post |

Ogni formato ha un'impaginazione propria. La risoluzione finale (720p–4K) si sceglie nella scheda Esporta.

### Stile

- **Orbita**: anello di barre radiali che pulsa sulla cassa, con onde concentriche e scintille. Al centro ci sono un oscilloscopio, un nucleo pulsante oppure la copertina.
- **Orizzonte**: barre speculari con i bassi al centro, un riflesso sotto e una linea di luce.
- **Onda**: curve morbide sovrapposte; le copie più tenui mostrano lo spettro di pochi istanti prima, come una scia.

### Forma

| Opzione | Effetto | Stili |
|---|---|---|
| Dimensione | Ingrandisce o rimpicciolisce la grafica | tutti |
| Posizione verticale | Sposta la grafica in alto o in basso | tutti |
| Densità | Numero di barre o punti della curva | tutti |
| Spessore linee | Spessore di barre e curve | tutti |
| Simmetrico | Barre speculari (sì) oppure spettro su tutto il giro (no) | Orbita |
| Bassi in alto / in basso | Dove stanno le frequenze basse | Orbita, se simmetrico |
| Rotazione | L'anello gira, più veloce nelle parti cariche | Orbita |
| Centro dell'anello | Oscilloscopio, nucleo pulsante o vuoto | Orbita, senza copertina |
| Anello dei battiti | Anello di punti che scatta a ogni battuta | Orbita |
| Riflesso | Riflesso attenuato sotto le barre | Orizzonte |
| Strati della scia | Numero di curve sovrapposte (1–6) | Onda |
| Onde sui colpi di cassa | Cerchi o linee che si propagano sui colpi | tutti |

### Colori

- **Palette**: otto combinazioni pronte (Brace, Ghiaccio, Avorio, Corallo, Menta, Notte, Tramonto, Oro). Impostano anche i colori dello sfondo.
- **Primario / Secondario**: colori a scelta libera.
- **Colore delle barre**:
  - *Frequenza*: sfuma dal primario (bassi) al secondario (acuti).
  - *Intensità*: le barre più alte prendono il secondario.
  - *Unico*: solo il primario.
- **Variazione di tinta nel tempo**: i colori ruotano lentamente lungo il brano, più in fretta nelle parti cariche.

### Dinamica

| Comando | Effetto |
|---|---|
| **Reattività** | Quanto la grafica si muove col suono |
| **Morbidezza** | Velocità con cui le barre ricadono. Bassa: scatti secchi; alta: movimento fluido |
| **Sensibilità ai colpi** | Quanti colpi di cassa e accenti vengono rilevati. Più alta = più eventi (onde, scintille, lampi) |
| **Sincronia grafica** | Sposta la grafica rispetto all'audio (±150 ms). Un valore negativo la fa anticipare, e spesso percepiamo il ritmo più "preciso". Testo e barra di avanzamento non si spostano |

Sotto gli slider c'è il conteggio aggiornato di colpi, accenti e BPM.

---

## Scheda Scena

### Sfondo

- **Tinta unita** o **Sfumato** (due colori in diagonale).
- **Alone centrale**: luce dietro la grafica che respira con i bassi.
- **Immagine**: viene sfocata e scurita e pulsa leggermente sui bassi. Puoi regolarne **sfocatura** e **oscuramento**.

### Effetti

| Effetto | Cosa fa |
|---|---|
| Bagliore | Alone luminoso (bloom) attorno alla grafica |
| Colpo di camera | Piccolo zoom sui colpi di cassa |
| Lampo sui colpi | Lampo di luce sui colpi |
| Vibrazione | Scossa della grafica sui colpi (per brani aggressivi) |
| Particelle | Quantità di polvere luminosa e scintille (0 = nessuna) |
| Vignettatura | Bordi scuri |
| Grana pellicola | Grana animata in stile analogico |

> La grana aumenta il peso del video: se la usi, preferisci la qualità *Alta*.

### Copertina e logo

- **Copertina** (solo Orbita): l'immagine al centro dell'anello.
- **Logo**: un'immagine (meglio un PNG trasparente) in uno dei sei angoli o posizioni centrali, con dimensione e opacità regolabili.

Trascinando un'immagine nella finestra: con Orbita e senza copertina diventa la copertina, altrimenti lo sfondo.

---

## Scheda Testi

### Titoli

- **Titolo** e **Artista**.
- **Carattere**: font di sistema, Google Fonts (serve la connessione) oppure un font tuo (`.ttf`, `.otf`, `.woff`). I font caricati valgono solo finché la pagina resta aperta.
- **Colore del testo**: vale per il titolo e il testo della canzone; l'artista usa il colore secondario.
- **Posizione** (automatica, in alto o in basso, a sinistra o al centro), **dimensione** e **maiuscolo**.
- **Barra di avanzamento**: se esporti un estratto, si riferisce all'estratto.

### Testo della canzone

**Sincronizzare a mano**

1. Incolla il testo, una frase per riga. Le righe vuote e i tag come `[Verse 1]` o `[Chorus]` vengono ignorati.
2. Premi **Sincronizza**: il brano riparte dall'inizio.
3. Mentre ascolti:

| Tasto | Azione |
|---|---|
| `Spazio` | Inizia la riga successiva |
| `X` | Schermo vuoto (parti strumentali) |
| `⌫` | Annulla l'ultimo tasto |
| `Esc` | Termina |

Il risultato è in formato **LRC** (`[mm:ss.xx] testo`), modificabile a mano. Una riga con il solo tempo fa sparire il testo da quel momento. **Salva .lrc** e **Importa .lrc/.txt** salvano e caricano il file; si può anche trascinare un `.lrc` nella finestra.

**Aspetto**

| Opzione | Effetto |
|---|---|
| Animazione | *Dissolvenza* (entra salendo), *Pop* (rimbalza), *Scoperta* (si rivela da sinistra), *Karaoke* (il colore scorre sulle parole) |
| Posizione | Automatica, in alto, al centro, in basso |
| Dimensione, Spessore | Grandezza e peso del carattere |
| Tutto maiuscolo | Testo in maiuscolo |
| Riga successiva | Mostra in piccolo, sotto, la riga in arrivo |

> In *Karaoke* la velocità dell'evidenziazione è stimata dalla lunghezza della riga, non dai tempi delle singole parole.

---

## Scheda Esporta

### Durata

- **Esporta solo un estratto**: perfetto per Reels e TikTok. Imposti inizio e fine:
  - scrivendoli (`1:05.5`);
  - con **⇤ qui** / **qui ⇥** (posizione attuale), oppure con i tasti `I` e `O`;
  - con **15 / 30 / 60 s da qui**.

  L'estratto appare evidenziato sulla barra di riproduzione e in anteprima va in loop.
- **Dissolvenza in entrata / in uscita**: dal nero e verso il nero, applicata sia al video sia all'audio.

### Video

| Opzione | Note |
|---|---|
| Risoluzione | 720p, 1080p, 1440p, 2160p (4K). Il 4K richiede più tempo e un Mac recente |
| 30 / 60 fps | 60 è più fluido; 30 rende i file più leggeri e l'esportazione più veloce |
| Qualità | *Alta* (circa 14 Mbps a 1080p60) o *Standard* (circa 8 Mbps) |
| Anteprima a piena risoluzione | Solo per l'anteprima; non cambia il video esportato |

Il pulsante mostra formato e dimensioni, e sotto c'è una stima del peso del file. Per avere più formati, esporta, cambia formato ed esporta di nuovo: il look resta lo stesso.

L'output è un MP4 H.264 + AAC, compatibile con YouTube, Instagram, TikTok e QuickTime. Il video esportato coincide con l'anteprima, fotogramma per fotogramma.

---

## Scorciatoie

| Tasto | Azione |
|---|---|
| `Spazio` / clic sull'anteprima | Play / pausa |
| `←` `→` | ±5 secondi |
| `I` / `O` | Inizio / fine dell'estratto alla posizione attuale |
| Doppio clic su uno slider | Valore predefinito |
