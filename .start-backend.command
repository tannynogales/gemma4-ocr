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

cd "$PROJECT_DIR/backend" || exit 1

if ! nvm use 20 >/dev/null 2>&1; then
  echo "No se pudo activar Node 20 para el backend."
  echo "Revisa /Users/tannynogales/Documents/projects/gemma4-ocr/backend/.nvmrc"
  echo
  read "?Presiona Enter para cerrar..."
  exit 1
fi

echo "cedula-poc backend"
echo "Node: $(node -v)"
echo "Ruta: $PWD"
echo "API: http://localhost:1337"
echo

npm run develop
EXIT_CODE=$?

echo
echo "El backend termino con codigo $EXIT_CODE."
read "?Presiona Enter para cerrar..."
exit "$EXIT_CODE"
