#!/bin/zsh

set -u

PORTS=(1337 4200)
FOUND_PROCESS=0

for PORT in "${PORTS[@]}"; do
  PIDS=(${(f)"$(lsof -ti :"$PORT" 2>/dev/null)"})

  if [[ ${#PIDS[@]} -gt 0 ]]; then
    kill "${PIDS[@]}" 2>/dev/null
    echo "Puerto $PORT detenido: ${PIDS[*]}"
    FOUND_PROCESS=1
  fi
done

if [[ "$FOUND_PROCESS" -eq 0 ]]; then
  echo "No habia procesos escuchando en 1337 o 4200."
fi

echo
read "?Presiona Enter para cerrar..."
