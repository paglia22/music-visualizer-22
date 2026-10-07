# Avvio e risoluzione problemi

## Perché serve un server locale

L'app è fatta di file statici (HTML, CSS, JavaScript), ma il browser non li esegue se li apri con doppio clic su `index.html` (indirizzo `file://`). I moduli JavaScript e le API video funzionano solo da `http://localhost`. Per questo serve un piccolo server locale, e Python 3 ne include già uno. Non c'è niente da installare né da compilare.

## Modi per avviarla

| Modo | Comando | Note |
|---|---|---|
| Doppio clic | `Avvia Onda Studio.command` | Avvia il server e apre Chrome |
| Terminale | `python3 -m http.server 8765 --bind 127.0.0.1` | Da lanciare dentro `music-visualizer/` |
| Node (opzionale) | `npx serve -l 8765` | Se preferisci Node a Python |

L'indirizzo è sempre <http://localhost:8765>. Con `--bind 127.0.0.1` l'app è raggiungibile solo dal tuo Mac.

## Browser

Usa **Google Chrome** (o un altro browser basato su Chromium, come Edge, Arc o Brave).
L'esportazione usa **WebCodecs**: Safari la supporta solo in parte e Firefox non codifica l'AAC.
Se il browser non è compatibile, il pannello *Esporta* lo segnala.

## Problemi comuni

**macOS blocca `Avvia Onda Studio.command`**
Tasto destro → Apri → Apri. Se il file non risulta eseguibile:

```bash
chmod +x "Avvia Onda Studio.command"
```

**"Address already in use" / la porta 8765 è occupata**
C'è già un server aperto, forse da un avvio precedente. Lo script lo riconosce e apre comunque la pagina. Da terminale puoi usare un'altra porta, ad esempio `8766`, oppure chiudere il processo:

```bash
lsof -ti tcp:8765 | xargs kill
```

**`python3: command not found`**
Installa gli strumenti da riga di comando di Apple (`xcode-select --install`) oppure Python da python.org.

**"Non riesco a leggere questo file audio"**
Il formato non è decodificabile dal browser. Converti in MP3 o WAV e riprova.

**L'anteprima scatta**
Togli la spunta da *Anteprima a piena risoluzione*: l'anteprima è solo una visualizzazione e il video esportato non ne risente.

**L'esportazione si ferma o va in errore**
Tieni la scheda in primo piano durante l'esportazione: i browser rallentano le schede in background. Se l'errore riguarda la codifica H.264, prova 30 fps o qualità *Standard*.

## Dove vengono salvati i dati

- **Video**: in Chrome scegli tu dove salvarlo, e il file viene scritto direttamente su disco. Negli altri browser parte un download normale.
- **Impostazioni** (stile, colori, dinamica…) e **testi sincronizzati**: nel `localStorage` del browser. I testi sono salvati per ogni brano, in base al nome del file. Cancellando i dati del sito su `localhost:8765` si azzerano.
