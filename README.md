# cedula-poc

POC local completa para extraer datos de la cara frontal de una cédula chilena usando:

- Frontend Angular standalone
- Backend Strapi v5 con TypeScript
- SQLite
- LM Studio local
- Modelos LM Studio seleccionables desde la UI
- API OpenAI-compatible en `http://localhost:1234/v1`

La solución está pensada para macOS Apple Silicon y prioriza claridad, mantenibilidad y ejecución completamente local.

## Estructura

```text
.
├── backend   # Strapi v5 + SQLite + upload local + integración LM Studio
├── frontend  # Angular standalone
└── README.md
```

## Flujo funcional

1. El usuario abre Angular.
2. Selecciona una imagen frontal de cédula chilena.
3. Angular muestra preview.
4. Angular envía la imagen a Strapi.
5. Strapi valida y guarda la imagen localmente.
6. Strapi consulta los modelos disponibles en LM Studio y usa el modelo elegido por el usuario.
7. LM Studio devuelve extracción estructurada.
8. Strapi normaliza, valida y guarda un registro preliminar.
9. Angular muestra un formulario editable.
10. El usuario corrige si hace falta y confirma.
11. Strapi guarda el payload final en SQLite.
12. Angular permite revisar el historial y el detalle.

## Requisitos previos

- macOS Apple Silicon
- `nvm`
- Node `20.x` para backend
- Node `24.x` para frontend
- LM Studio instalado
- LM Studio corriendo con servidor local habilitado
- Al menos un modelo multimodal descargado y cargado en LM Studio
- Recomendados para esta POC:
  - `google/gemma-4-e2b`
  - `gemma-4-e4b-it`

## Versiones de Node usadas

- Backend: `20.20.0`
- Frontend: `24.13.0`

Se incluyen estos archivos para facilitar el cambio de runtime:

- [backend/.nvmrc](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/.nvmrc)
- [frontend/.nvmrc](/Users/tannynogales/Documents/projects/gemma4-ocr/frontend/.nvmrc)

## Variables de entorno del backend

Archivo:

- [backend/.env.example](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/.env.example)

Variables relevantes:

```env
PUBLIC_URL=http://localhost:1337
FRONTEND_URL=http://localhost:4200
DATABASE_CLIENT=sqlite
DATABASE_FILENAME=.tmp/data.db
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=google/gemma-4-e2b
LM_STUDIO_TIMEOUT_MS=90000
MAX_UPLOAD_SIZE_MB=8
```

Notas:

- Strapi ya dejó un [backend/.env](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/.env) funcional en el scaffold.
- Si quieres recrearlo, puedes partir de `.env.example` y completar los secretos.
- `LM_STUDIO_MODEL` queda como modelo por defecto del backend, pero la UI permite elegir otro modelo cargado en LM Studio antes de cada extracción.

## Orden de ejecución

1. Iniciar LM Studio
2. Iniciar backend Strapi
3. Iniciar frontend Angular

## Inicio rápido en macOS

Quedaron estos archivos de uso manual en la raíz del proyecto:

- [start-cedula-poc.command](/Users/tannynogales/Documents/projects/gemma4-ocr/start-cedula-poc.command)
- [stop-cedula-poc.command](/Users/tannynogales/Documents/projects/gemma4-ocr/stop-cedula-poc.command)

Uso recomendado:

1. Abrir LM Studio
2. Hacer doble clic en `start-cedula-poc.command`
3. Se abrirán dos ventanas de Terminal:
   backend con Node 20
   frontend con Node 24
4. Cuando termines, puedes hacer doble clic en `stop-cedula-poc.command`

Notas:

- Esto evita tener que entrar manualmente a `backend` y `frontend`.
- También evita depender de `ng` global, porque el frontend arranca con `npm start`.
- Los scripts auxiliares de arranque quedan ocultos para no mostrarse en Finder.

## Comandos exactos

### 1) Iniciar LM Studio

En la app de LM Studio:

1. Cargar uno o más modelos en LM Studio
2. Recomendado: dejar cargado `google/gemma-4-e2b` y/o `gemma-4-e4b-it`
3. Activar el servidor local OpenAI-compatible
4. Verificar que quede disponible en `http://localhost:1234/v1`

### 2) Backend Strapi

```bash
cd /Users/tannynogales/Documents/projects/gemma4-ocr/backend
nvm use 20
npm install
npm run develop
```

Backend disponible en:

- API: [http://localhost:1337](http://localhost:1337)
- Admin: [http://localhost:1337/admin](http://localhost:1337/admin)

### 3) Frontend Angular

En otra terminal:

```bash
cd /Users/tannynogales/Documents/projects/gemma4-ocr/frontend
nvm use 24
npm install
npm start
```

Frontend disponible en:

- [http://localhost:4200](http://localhost:4200)

## Verificación rápida

### Backend

Con Strapi corriendo:

```bash
curl http://localhost:1337/api/identity-readings
```

La primera vez debería responder algo como:

```json
{"data":[],"meta":{"total":0}}
```

Para ver los modelos que la UI podrá seleccionar:

```bash
curl http://localhost:1337/api/identity-readings/models
```

### Frontend

1. Abrir `http://localhost:4200`
2. Elegir el modelo OCR local
3. Subir una imagen
4. Revisar el formulario
5. Confirmar
6. Ir a historial

## Endpoints implementados

### `POST /api/identity-readings/extract`

Recibe `multipart/form-data` con los campos:

- `file`
- `modelName`

Hace:

- valida tipo y tamaño
- guarda la imagen localmente
- valida que el modelo exista en LM Studio
- llama a LM Studio con el modelo seleccionado
- normaliza la respuesta
- crea registro `draft_extracted`
- devuelve `id`, imagen, payload extraído y warnings

### `GET /api/identity-readings/models`

Devuelve la lista de modelos visibles en LM Studio para poblar el selector del frontend.

Incluye:

- `defaultModelName`
- `models[]`
- `id`
- `label`
- `ownedBy`
- `isDefault`

### `POST /api/identity-readings/:id/confirm`

Recibe el payload final editado por el usuario.

Hace:

- valida payload final
- recalcula estado
- actualiza el registro
- guarda `finalPayload`

Estados:

- `reviewed_confirmed`
- `reviewed_corrected`

### `GET /api/identity-readings`

Lista historial ordenado por fecha descendente.

### `GET /api/identity-readings/:id`

Devuelve detalle del registro, imagen asociada, payload IA y payload final.

## Validaciones y seguridad mínima aplicadas

- Sólo se aceptan `image/jpeg`, `image/jpg`, `image/png`
- Tamaño máximo configurable con `MAX_UPLOAD_SIZE_MB`
- El frontend nunca llama a LM Studio directamente
- La respuesta del modelo no se persiste ciegamente
- El backend normaliza y valida antes de guardar
- Se valida visualmente el RUN también en frontend
- Se controlan errores de timeout y parseo de JSON

## Decisiones técnicas relevantes

### Backend

- Content-type: `identity-reading`
- Persistencia: SQLite local en `backend/.tmp/data.db`
- Upload provider: local en `backend/public/uploads`
- Integración LM Studio: `fetch` nativo, sin SDK extra
- Endpoint usado: `POST /v1/chat/completions`
- Selector de modelos: el frontend pregunta al backend por `GET /api/identity-readings/models`
- Fallback implementado:
  Si LM Studio rechaza `response_format`, el servicio reintenta automáticamente sin ese parámetro

### Frontend

- Angular standalone con rutas lazy
- `HttpClient`
- Signals para estado local de pantalla
- Selector simple de modelo OCR antes de extraer
- Sin NgRx
- UI en español
- Componentes pequeños: extracción, formulario de revisión, historial y detalle

## Qué guarda cada registro

- Imagen original
- Campos estructurados extraídos
- Payload crudo/normalizado de IA
- Payload final confirmado
- Texto visible detectado si existe
- Nombre del modelo
- Confianza
- Warnings
- Estado
- Timestamps

## Archivos importantes

### Backend

- [backend/src/api/identity-reading/content-types/identity-reading/schema.json](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/src/api/identity-reading/content-types/identity-reading/schema.json)
- [backend/src/api/identity-reading/controllers/identity-reading.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/src/api/identity-reading/controllers/identity-reading.ts)
- [backend/src/api/identity-reading/services/identity-reading.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/src/api/identity-reading/services/identity-reading.ts)
- [backend/src/api/identity-reading/routes/custom-identity-reading.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/src/api/identity-reading/routes/custom-identity-reading.ts)
- [backend/src/services/lm-studio-service.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/src/services/lm-studio-service.ts)

### Frontend

- [frontend/src/app/core/services/identity-reading-api.service.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/frontend/src/app/core/services/identity-reading-api.service.ts)
- [frontend/src/app/features/identity-extraction/pages/identity-extraction-page.component.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/frontend/src/app/features/identity-extraction/pages/identity-extraction-page.component.ts)
- [frontend/src/app/features/identity-extraction/components/review-form.component.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/frontend/src/app/features/identity-extraction/components/review-form.component.ts)
- [frontend/src/app/features/history/pages/history-page.component.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/frontend/src/app/features/history/pages/history-page.component.ts)
- [frontend/src/app/features/history/pages/history-detail-page.component.ts](/Users/tannynogales/Documents/projects/gemma4-ocr/frontend/src/app/features/history/pages/history-detail-page.component.ts)

## Troubleshooting

### 1) LM Studio no responde

- Confirmar que el servidor local esté encendido
- Confirmar URL: `http://localhost:1234/v1`
- Confirmar que el modelo esté cargado
- Revisar si otro proceso ocupa el puerto `1234`

### 2) El modelo no está cargado

- Abrir LM Studio
- Cargar `google/gemma-4-e2b`
- Reintentar extracción

### 3) LM Studio devuelve error por `response_format`

La integración ya hace fallback automático sin `response_format`.
Si aun así falla, normalmente el problema es del modelo cargado o de la compatibilidad de esa versión local de LM Studio.

### 4) La respuesta del modelo no es JSON válido

El backend intenta rescatar el primer bloque JSON utilizable.
Si no puede, guarda el intento como `extraction_failed` y devuelve error claro.

### 5) Problemas de CORS

Revisar en [backend/.env](/Users/tannynogales/Documents/projects/gemma4-ocr/backend/.env):

```env
FRONTEND_URL=http://localhost:4200
```

### 6) Error de upload

- Verificar formato JPG/PNG
- Verificar tamaño máximo
- Verificar permisos de escritura en `backend/public/uploads`

### 7) SQLite bloqueado

- Cerrar procesos viejos de Strapi
- Volver a levantar `npm run develop`
- Si es necesario, eliminar `backend/.tmp/data.db` con el backend apagado

### 8) Historial vacío después de reiniciar

Si borras `backend/.tmp/data.db`, SQLite se recrea vacío en el siguiente arranque.

## Build de verificación

Se dejó implementado y compilado con:

### Backend

```bash
cd /Users/tannynogales/Documents/projects/gemma4-ocr/backend
nvm use 20
npm run build
```

### Frontend

```bash
cd /Users/tannynogales/Documents/projects/gemma4-ocr/frontend
nvm use 24
npm run build
```

## Qué faltaría validar localmente con tu caso real

- Subir una foto real de cédula chilena frontal
- Medir calidad del OCR del modelo `google/gemma-4-e2b` con tus imágenes
- Ajustar prompt si quieres mayor recall o menor verbosidad en `warnings`
- Ajustar campos de normalización si tus muestras reales traen formatos distintos

La implementación está completa y funcional para correr en local. El comportamiento final de extracción dependerá de la calidad de imagen y de cómo responda tu instancia local de LM Studio con el modelo cargado.
