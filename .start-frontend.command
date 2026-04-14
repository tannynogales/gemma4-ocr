#!/bin/zsh

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  echo "No se encontro nvm en: $NVM_DIR/nvm.sh"
  echo "Instala nvm o corrige NVM_DIR antes de iniciar la POC."
  echo
  read "?Presiona Enter para cerrar..."
  exit 1
fi

source "$NVM_DIR/nvm.sh"

cd "$PROJECT_DIR/frontend" || exit 1

if ! nvm use 24 >/dev/null 2>&1; then
  echo "No se pudo activar Node 24 para el frontend."
  echo "Revisa /Users/tannynogales/Documents/projects/gemma4-ocr/frontend/.nvmrc"
  echo
  read "?Presiona Enter para cerrar..."
  exit 1
fi

echo "cedula-poc frontend"
echo "Node: $(node -v)"
echo "Ruta: $PWD"
echo "App: http://localhost:4200"
echo

npm start
EXIT_CODE=$?

echo
echo "El frontend termino con codigo $EXIT_CODE."
read "?Presiona Enter para cerrar..."
exit "$EXIT_CODE"
