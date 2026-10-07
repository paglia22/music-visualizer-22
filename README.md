# Onda Studio

Crea video musicali minimal che seguono il ritmo del brano: carichi l'audio, scegli stile e colori, esporti un MP4 (16:9, 9:16 o 1:1).

Funziona interamente nel browser, in locale. L'audio non viene caricato su nessun server.

**Cosa puoi fare**
- 3 stili (Orbita, Orizzonte, Onda) con forma, densità, spessore, rotazione e simmetria regolabili
- 4 formati (16:9, 9:16, 4:5, 1:1) da 720p a 4K, a 30 o 60 fps
- 8 palette, colori liberi, variazione di tinta nel tempo, sfondo sfumato o con immagine
- Effetti legati al ritmo: bagliore, colpo di camera, lampi, vibrazione, particelle, grana
- Titolo, artista, logo, copertina, font di sistema, Google Fonts o font tuoi
- Testo della canzone sincronizzato a mano, con 4 animazioni (anche karaoke)
- Esportazione di un estratto (per Reels e TikTok) con dissolvenze
- Look salvabili ed esportabili in `.json`, per usare lo stesso stile su più brani

## Avvio rapido

**Requisiti:** macOS, Python 3 (già presente se `python3 --version` risponde) e Google Chrome.

1. Doppio clic su **`Avvia Onda Studio.command`**.
2. Si apre Chrome su `http://localhost:8765`.
3. Trascina un brano nella finestra e premi **Esporta**.

Lascia aperta la finestra del Terminale finché usi l'app; chiudendola, l'app si ferma.

> La prima volta macOS potrebbe bloccare lo script ("sviluppatore non identificato"): tasto destro sul file → **Apri** → **Apri**.

### In alternativa, da terminale

```bash
cd ~/Desktop/Dev/music-visualizer
```

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Poi apri in Chrome: <http://localhost:8765>. Per fermare il server: `Ctrl+C`.

## Struttura

```
music-visualizer/
├── Avvia Onda Studio.command   avvio con doppio clic
├── index.html, styles.css      interfaccia
├── src/                        codice (analisi, rendering, export, testo)
├── vendor/mp4-muxer.mjs        libreria per creare l'MP4
└── documentation/              documentazione
```

## Documentazione

- [Avvio e risoluzione problemi](documentation/avvio.md)
- [Guida all'uso](documentation/guida.md): stili, dinamica, testo sincronizzato, esportazione
- [Architettura](documentation/architettura.md): come funziona il codice e come estenderlo
