# Guida all'uso

## Flusso di lavoro

1. **Carica il brano**: trascinalo nella finestra oppure usa *Scegli file audio…*. Sono supportati MP3, WAV, M4A, FLAC, OGG e Opus. L'analisi richiede pochi secondi; poi il pannello mostra durata, BPM e numero di colpi rilevati.
2. **Scegli formato e stile** e controlla l'anteprima (`Spazio` per play/pausa).
3. **Personalizza** colori, dinamica, titoli, immagini e testo.
4. **Esporta**.

Il titolo viene preso dal nome del file, togliendo il numero di traccia: `2. Raggi di Fuoco.m4a` diventa "Raggi di Fuoco". Puoi modificarlo.

## Formati

| Formato | Risoluzione | Per |
|---|---|---|
| 16:9 | 1920×1080 | YouTube |
| 9:16 | 1080×1920 | Reels, TikTok, Shorts, Storie |
| 1:1 | 1080×1080 | Post |

Ogni formato ha un'impaginazione propria. Si esporta un formato alla volta: per averne più di uno, esporta, cambia formato ed esporta di nuovo.

## Stili

- **Orbita**: anello di barre radiali (bassi in alto, acuti in basso) che pulsa sulla cassa. Ogni colpo genera onde concentriche e scintille, e l'anello di punti esterno scatta a ogni battuta. Al centro c'è un oscilloscopio circolare oppure la copertina, se la carichi.
- **Orizzonte**: barre speculari con i bassi al centro, un riflesso sotto e una linea di luce che si accende sui colpi.
- **Onda**: curve morbide sovrapposte. Le copie più tenui sono lo spettro di pochi istanti prima e creano un effetto scia.

## Dinamica

| Comando | Effetto |
|---|---|
| **Reattività** | Quanto la grafica si muove con il suono. Sotto 1× è più sobria, sopra è più esplosiva. |
| **Morbidezza** | Velocità con cui le barre ricadono dopo un picco. Bassa: scatti secchi, molto aderenti al ritmo. Alta: movimento fluido. |
| **Bagliore** | Intensità dell'alone luminoso (bloom). |
| **Particelle** | Polvere luminosa di sfondo e scintille sui colpi. |

L'intensità generale segue anche l'energia della sezione: strofe e breakdown risultano più calmi, ritornelli e drop più intensi.

## Colori e immagini

- Le palette predefinite impostano colore primario, secondario e sfondo. Puoi anche sceglierli a mano.
- **Copertina**: compare al centro dello stile Orbita.
- **Sfondo**: viene sfocato e scurito, e respira leggermente sui bassi.
- Puoi trascinare un'immagine nella finestra: con Orbita e senza copertina diventa la copertina, altrimenti lo sfondo.

## Testo della canzone

### Sincronizzare a mano (consigliato)

1. Incolla il testo nel riquadro, una frase per riga.
   Le righe vuote e i tag di sezione come `[Verse 1]` o `[Chorus]` vengono ignorati.
2. Premi **Sincronizza**: il brano riparte dall'inizio.
3. Mentre ascolti, usa questi tasti:

| Tasto | Azione |
|---|---|
| `Spazio` | Inizia la riga successiva |
| `X` | Schermo vuoto (per le parti strumentali) |
| `⌫` | Annulla l'ultimo tasto |
| `Esc` | Termina |

Alla fine il riquadro contiene il testo in formato **LRC**:

```
[00:12.40] Prima riga
[00:15.85] Seconda riga
[00:31.20]
```

Una riga con il solo tempo fa sparire il testo da quel momento.

### Ritoccare e salvare

- Puoi correggere i tempi direttamente nel riquadro: l'anteprima si aggiorna subito.
- **Salva .lrc** scarica il file, **Importa .lrc/.txt** lo ricarica. Funziona anche trascinando un `.lrc` nella finestra.
- Un testo resta sullo schermo fino alla riga successiva; se non arriva niente per molti secondi, sfuma da solo.
- **Dimensione** e **Mostra il testo nel video** controllano l'aspetto.

## Esportazione

| Opzione | Note |
|---|---|
| **60 fps** | Più fluido, consigliato per brani energici |
| **30 fps** | File più leggero ed esportazione più veloce |
| **Alta / Standard** | Bitrate circa 14 / 8 Mbps a 1080p60 |

- Il pannello mostra una stima del peso del file.
- L'esportazione è in genere più veloce del brano stesso. Una finestra mostra l'avanzamento con un'anteprima e il tempo rimanente.
- Il video esportato è identico all'anteprima, fotogramma per fotogramma.
- L'output è un MP4 H.264 + AAC, compatibile con YouTube, Instagram, TikTok e QuickTime.

## Scorciatoie

| Tasto | Azione |
|---|---|
| `Spazio` / clic sull'anteprima | Play / pausa |
| `←` `→` | ±5 secondi |
