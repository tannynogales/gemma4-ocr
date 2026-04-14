#!/bin/zsh

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_COMMAND="$PROJECT_DIR/.start-backend.command"
FRONTEND_COMMAND="$PROJECT_DIR/.start-frontend.command"

if [[ ! -f "$BACKEND_COMMAND" || ! -f "$FRONTEND_COMMAND" ]]; then
  echo "No encontre los archivos de inicio rapido."
  echo "Backend esperado: $BACKEND_COMMAND"
  echo "Frontend esperado: $FRONTEND_COMMAND"
  echo
  read "?Presiona Enter para cerrar..."
  exit 1
fi

if ! curl -fsS http://localhost:1234/v1/models >/dev/null 2>&1; then
  echo "Aviso: LM Studio no responde en http://localhost:1234/v1"
  echo "La POC igual puede abrirse, pero la extraccion fallara hasta que LM Studio este arriba."
  echo
fi

open -a Terminal "$BACKEND_COMMAND"
sleep 1
open -a Terminal "$FRONTEND_COMMAND"

echo "Se abrieron backend y frontend en Terminal."
echo
echo "Backend:  http://localhost:1337"
echo "Frontend: http://localhost:4200"
echo
echo "Recuerda iniciar LM Studio antes de extraer datos."
sleep 2
