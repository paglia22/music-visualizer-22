# Onda Studio

Crea video musicali minimal che seguono il ritmo del brano: carichi l'audio, scegli stile e colori, esporti un MP4 (16:9, 9:16 o 1:1).

Funziona interamente nel browser, in locale. L'audio non viene caricato su nessun server.

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
