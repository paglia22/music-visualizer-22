#!/bin/bash
# Doppio clic per avviare Onda Studio in Chrome. Chiudi questa finestra per fermarlo.
cd "$(dirname "$0")" || exit 1
PORT=8765

if ! lsof -ti tcp:$PORT >/dev/null 2>&1; then
  python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null' EXIT
  sleep 1
fi

URL="http://localhost:$PORT"
open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
echo "Onda Studio è attivo su $URL"
echo "Lascia aperta questa finestra mentre lo usi. Premi Ctrl+C (o chiudila) per fermarlo."
wait
