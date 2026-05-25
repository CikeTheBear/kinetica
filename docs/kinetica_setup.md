# 🔧 KINÉTICA — SETUP Y DECISIONES TÉCNICAS

> Documento complementario al PRD v2 y al doc de identidad de Kai.
> Cubre variables de entorno, schemas faltantes, política de errores,
> streaming, internacionalización, observabilidad, testing y disclaimer.
> Está pensado para que el agente de código tenga **cero ambigüedad** al arrancar.

---

## 1. VARIABLES DE ENTORNO

Separadas por capa de seguridad. **Nunca** prefijar con `NEXT_PUBLIC_` algo que
deba quedarse en el servidor.

### Vercel — Frontend (públicas, expuestas al browser)

```bash
NEXT_PUBLIC_APP_URL=https://kinetica.app
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BJ...        # llave pública Web Push (segura de exponer)
NEXT_PUBLIC_DEFAULT_LOCALE=es              # 'es' | 'en'
```

### Vercel — Server-side (privadas, solo en API routes / Server Components)

```bash
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_FALLBACK_MODEL=openai/gpt-4o
YOUTUBE_API_KEY=AIza...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...        # CRÍTICO: nunca expones al cliente
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu@email.com
SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...                       # para sourcemaps
```

### Supabase Edge Functions — Secrets

Configurados desde el dashboard de Supabase. Las Edge Functions corren en Deno,
fuera de Vercel.

```bash
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_DEFAULT_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_FALLBACK_MODEL=openai/gpt-4o
YOUTUBE_API_KEY=AIza...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:tu@email.com
SUPABASE_URL=https://xxxxx.supabase.co     # auto-poblado por Supabase
SUPABASE_SERVICE_ROLE_KEY=...               # auto-poblado por Supabase
```

### Por qué esta separación

- **Vercel env vars** para todo lo que consume Next.js (frontend + API routes).
- **Supabase secrets** para las Edge Functions que corren los cron jobs y el
  procesamiento pesado (parser de Apple Health, etc.).
- **No usar Supabase Vault** para estas keys. Vault está pensado para secrets
  consumidos desde Postgres (triggers SQL). Tus llamadas a OpenRouter las hace
  Next.js o Edge Functions, no Postgres.

---

## 2. SCHEMA FALTANTE — `push_subscriptions`

Tabla necesaria para Web Push notifications.

```sql
CREATE TABLE push_subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint      text NOT NULL,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz DEFAULT now(),
  last_used_at  timestamptz DEFAULT now(),

  UNIQUE (user_id, endpoint)
);

-- RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);
```

### Flujo de uso

1. Frontend pide permiso al navegador (`Notification.requestPermission()`).
2. Si aprobado, registra service worker y obtiene `PushSubscription`.
3. Frontend POSTea endpoint + keys a API route que inserta en
   `push_subscriptions`.
4. Cron job que necesita notificar lee subscriptions del usuario, envía push
   firmado con `VAPID_PRIVATE_KEY` usando librería `web-push` (Node) o `webpush`
   (Deno).
5. Si el envío falla con 410 Gone, eliminar la subscription (el usuario
   desinstaló la PWA).

---

## 3. ESTRUCTURA DE `metadata_biometrica` (jsonb)

Esta es la forma canónica del campo `user_profiles.metadata_biometrica`. Kai
debe respetarla siempre. Todos los campos son opcionales para tolerar perfiles
incompletos durante el onboarding.

```json
{
  "edad": 36,
  "sexo_biologico": "masculino",
  "altura_cm": 178,
  "peso_inicial_kg": 78.5,
  "objetivo_principal": "hipertrofia",
  "objetivos_secundarios": ["salud_articular", "energia_diaria"],
  "nivel_experiencia": "intermedio",
  "anos_entrenando": 6,
  "dias_disponibles": 4,
  "minutos_por_sesion": 60,
  "horario_habitual": "tarde",
  "equipamiento": ["gimnasio_comercial"],
  "lesiones_activas": [
    {
      "id": "uuid-generado",
      "zona": "hombro_derecho",
      "tipo": "molestia",
      "severidad": "leve",
      "desde": "2026-04-12",
      "notas": "Aparece solo en press por encima de la cabeza",
      "ejercicios_evitar": ["press_militar", "snatch"]
    }
  ],
  "lesiones_historicas": [
    {
      "zona": "lumbar",
      "resuelta_en": "2025-08-01",
      "notas": "Hernia discal L4-L5 leve, resuelta con fisio"
    }
  ],
  "preferencias": {
    "ama": ["dominadas", "peso_muerto"],
    "evita": ["correr_largo"],
    "neutral": []
  },
  "restricciones_dieteticas": [],
  "wearables": ["apple_watch"],
  "bascula_inteligente": true,
  "notas_libres": "Trabajo desde casa, flexibilidad de horario alta"
}
```

### Enums controlados

Para que Kai no invente valores, estos campos tienen valores cerrados:

- `sexo_biologico`: `masculino` | `femenino` | `no_especifica`
- `objetivo_principal`: `fuerza` | `hipertrofia` | `perdida_grasa` | `salud_general` | `rendimiento_deportivo` | `recomposicion`
- `nivel_experiencia`: `principiante` | `intermedio` | `avanzado`
- `horario_habitual`: `manana` | `mediodia` | `tarde` | `noche` | `variable`
- `equipamiento` (array): `gimnasio_comercial` | `home_gym_completo` | `mancuernas_basicas` | `bandas_elasticas` | `peso_corporal_solo` | `otro`
- `severidad` (lesión): `leve` | `moderada` | `severa`

---

## 4. POLÍTICA DE ERRORES DEL LLM

Retry con backoff exponencial y notificación al usuario si el problema persiste.

### Estrategia por contexto

| Contexto | Estrategia |
|---|---|
| **Chat conversacional** | 2 retries con backoff (1s, 3s). Si falla, mensaje genérico al usuario: "Hubo un problema procesando tu mensaje, inténtalo de nuevo". |
| **Generación de plan semanal (cron)** | 3 retries con backoff (5s, 15s, 45s). Si modelo principal falla, intentar con `OPENROUTER_FALLBACK_MODEL`. Si todo falla, loguear en Sentry + insertar mensaje proactivo de Kai disculpándose y pidiendo al usuario que pida el plan manualmente. |
| **Tool calls que modifican datos** | 1 retry. Si falla, **no hacer rollback agresivo** — informar al usuario que la acción no se completó. |
| **Structured output inválido** | 1 retry forzando el schema más estricto. Si falla otra vez, escalar a fallback model. |
| **Parseo de archivos (Apple Health, PDF)** | 2 retries. Si falla, notificar al usuario qué archivo falló y permitir reintentar manualmente. |

### Implementación

Crear un wrapper `callLLM()` en `lib/llm.ts` que encapsule:
- Retries con backoff exponencial.
- Switching automático a fallback model.
- Logging a Sentry con contexto (user_id, tool_name, prompt size, error).
- Timeout duro de 60s por llamada.

### Validación de structured outputs

Después de cada llamada con `response_format: json_schema`, validar el output
contra el schema con `zod` antes de usarlo. Si falla validación, tratar como
error de LLM y aplicar retry.

---

## 5. JSON SCHEMAS DE LAS TOOLS RESTANTES

Estos schemas se pasan al LLM para function calling. Definen exactamente qué
inputs acepta cada tool.

### `register_injury`

```json
{
  "name": "register_injury",
  "description": "Registra una nueva lesión o molestia del usuario y ajusta el plan activo para evitar ejercicios que la agraven.",
  "parameters": {
    "type": "object",
    "required": ["zona", "tipo", "severidad", "desde"],
    "properties": {
      "zona": {
        "type": "string",
        "description": "Zona anatómica afectada (ej. 'hombro_derecho', 'rodilla_izquierda', 'lumbar')"
      },
      "tipo": {
        "type": "string",
        "enum": ["molestia", "dolor_agudo", "dolor_cronico", "lesion_confirmada"]
      },
      "severidad": {
        "type": "string",
        "enum": ["leve", "moderada", "severa"]
      },
      "desde": {
        "type": "string",
        "format": "date"
      },
      "notas": {
        "type": "string",
        "description": "Descripción de cómo aparece, qué movimientos la disparan, etc."
      },
      "ejercicios_evitar": {
        "type": "array",
        "items": { "type": "string" },
        "description": "IDs o nombres de ejercicios que la agravan"
      }
    }
  }
}
```

### `resolve_injury`

```json
{
  "name": "resolve_injury",
  "description": "Marca una lesión existente como resuelta cuando el usuario confirma que ya no le molesta.",
  "parameters": {
    "type": "object",
    "required": ["injury_id"],
    "properties": {
      "injury_id": {
        "type": "string",
        "description": "UUID de la lesión a resolver, obtenido de metadata_biometrica.lesiones_activas"
      },
      "notas_resolucion": {
        "type": "string"
      }
    }
  }
}
```

### `modify_current_plan`

```json
{
  "name": "modify_current_plan",
  "description": "Modifica el plan semanal activo. Usar para ajustes puntuales (sustituir ejercicio, cambiar carga, reorganizar día) sin regenerar todo el plan.",
  "parameters": {
    "type": "object",
    "required": ["dia", "cambios"],
    "properties": {
      "dia": {
        "type": "string",
        "enum": ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
      },
      "cambios": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["accion"],
          "properties": {
            "accion": {
              "type": "string",
              "enum": ["sustituir_ejercicio", "modificar_carga", "modificar_reps", "modificar_sets", "eliminar_ejercicio", "agregar_ejercicio"]
            },
            "ejercicio_original_wger_id": { "type": "integer" },
            "ejercicio_nuevo_wger_id": { "type": "integer" },
            "ejercicio_nuevo_nombre": { "type": "string" },
            "peso_kg": { "type": "number" },
            "reps_objetivo": { "type": "string" },
            "sets": { "type": "integer" },
            "razon": { "type": "string" }
          }
        }
      }
    }
  }
}
```

### `log_biometric_entry`

```json
{
  "name": "log_biometric_entry",
  "description": "Registra una entrada manual de composición corporal cuando el usuario la reporta verbalmente.",
  "parameters": {
    "type": "object",
    "required": ["fecha"],
    "properties": {
      "fecha": { "type": "string", "format": "date" },
      "peso_kg": { "type": "number" },
      "porcentaje_grasa": { "type": "number" },
      "porcentaje_musculo": { "type": "number" },
      "porcentaje_agua": { "type": "number" },
      "grasa_visceral": { "type": "number" },
      "metabolismo_basal_kcal": { "type": "integer" }
    }
  }
}
```

### `log_health_metric`

```json
{
  "name": "log_health_metric",
  "description": "Registra una métrica de salud (HRV, sueño, FC reposo, etc.) cuando el usuario la reporta verbalmente.",
  "parameters": {
    "type": "object",
    "required": ["fecha", "tipo_metrica", "valor_numerico", "unidad"],
    "properties": {
      "fecha": { "type": "string", "format": "date" },
      "tipo_metrica": {
        "type": "string",
        "enum": ["hrv", "fc_reposo", "vo2max", "sueno_total_horas", "sueno_profundo_horas", "sueno_rem_horas", "pasos", "calorias_activas", "minutos_ejercicio", "frecuencia_respiratoria", "saturacion_oxigeno", "temperatura_corporal", "nivel_estres"]
      },
      "valor_numerico": { "type": "number" },
      "unidad": { "type": "string" }
    }
  }
}
```

### `query_progress_summary`

```json
{
  "name": "query_progress_summary",
  "description": "Genera un resumen analítico del progreso del usuario en un rango de tiempo, agregando datos de varias tablas.",
  "parameters": {
    "type": "object",
    "required": ["rango", "dimensiones"],
    "properties": {
      "rango": {
        "type": "string",
        "enum": ["ultima_semana", "ultimo_mes", "ultimos_3_meses", "ultimos_6_meses", "ultimo_ano", "todo"]
      },
      "dimensiones": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["composicion_corporal", "fuerza", "recuperacion", "adherencia", "volumen", "todo"]
        }
      }
    }
  }
}
```

---

## 6. ESTRUCTURA DE RESPUESTA DE KAI EN CHAT

Markdown extendido con bloques especiales reconocibles por el frontend.

### Markdown estándar soportado

- Texto, negritas, cursivas, listas, links, código inline.
- Headings hasta `###` (no usar `#` ni `##` en respuestas de chat).

### Bloques especiales

Kai puede emitir bloques estructurados envueltos en delimitadores reconocibles
por el frontend. Esto permite renderizar tarjetas, gráficos y alertas inline.

#### Tarjeta de plan del día

````markdown
```kinetica:plan-card
{
  "titulo": "Entreno de hoy: Empuje",
  "duracion_min": 55,
  "ejercicios": [
    {"nombre": "Press banca", "sets": 4, "reps": "6-8", "peso": "80kg"},
    {"nombre": "Press inclinado mancuernas", "sets": 3, "reps": "10", "peso": "24kg"}
  ]
}
```
````

#### Gráfico de progreso

````markdown
```kinetica:chart
{
  "tipo": "line",
  "titulo": "Peso últimos 30 días",
  "unidad": "kg",
  "datos": [
    {"fecha": "2026-04-24", "valor": 78.2},
    {"fecha": "2026-05-01", "valor": 77.8}
  ]
}
```
````

#### Alerta destacada

````markdown
```kinetica:alert
{
  "nivel": "warning",
  "titulo": "HRV bajo detectado",
  "mensaje": "Tu HRV está 18% bajo tu baseline desde hace 3 días."
}
```
````

Niveles: `info` | `success` | `warning` | `danger`.

### Reglas

- Kai usa bloques especiales **solo cuando aportan valor visual**, no en cada
  mensaje.
- El frontend parsea estos bloques durante el streaming y los renderiza como
  componentes React inline.
- Si el frontend no reconoce un bloque, lo muestra como código (degradación
  segura).

---

## 7. STREAMING DEL CHAT

### Decisión: Server-Sent Events (SSE)

Razones sobre WebSockets:
- Es el patrón estándar para LLM streaming (OpenRouter y todos los proveedores
  lo soportan nativamente).
- Más simple: HTTP unidireccional, no requiere mantener conexión persistente.
- Vercel y Supabase Edge Functions lo soportan sin configuración extra.
- WebSockets solo se justifican si necesitas server → client push fuera del
  contexto de una request, lo cual aquí no aplica (para eso usamos Web Push).

### Implementación

1. Frontend hace POST a `/api/chat` con el mensaje del usuario.
2. API route arma el contexto (Capas 1, 2, 3 de memoria) y llama a OpenRouter
   con `stream: true`.
3. La respuesta se transmite al cliente con `Content-Type: text/event-stream`.
4. Frontend usa `EventSource` o `fetch` con `ReadableStream` para consumir.
5. Cada chunk se parsea (tokens, tool calls, bloques especiales) y se renderiza
   incrementalmente.
6. Al cerrar el stream, se guarda el mensaje completo en `chat_messages`.

### Manejo de bloques especiales durante streaming

El parser del frontend debe ser **stateful**: detectar cuando se abre un bloque
` ```kinetica:* ` y acumular hasta encontrar el cierre antes de intentar parsear
el JSON. Mientras tanto, mostrar un placeholder de carga inline.

---

## 8. INTERNACIONALIZACIÓN (i18n)

Toda la app debe soportar **español** e **inglés** desde el día 1.

### Stack i18n

- **Librería:** `next-intl` (estándar para Next.js App Router).
- **Estructura de archivos:**
  ```
  /messages
    es.json
    en.json
  ```
- **Detección de idioma:** preferencia del usuario en `user_profiles.locale`,
  con fallback al `Accept-Language` del navegador, y default a `NEXT_PUBLIC_DEFAULT_LOCALE`.

### Schema adicional en `user_profiles`

Añadir columna:

```sql
ALTER TABLE user_profiles ADD COLUMN locale text NOT NULL DEFAULT 'es';
```

Valores: `es` | `en`.

### Estrategia para Kai

El LLM responde en el idioma del usuario. Esto se logra inyectando en el
system prompt al final:

```
El usuario tiene configurado el idioma: {locale}.
Responde siempre en ese idioma. Mantén términos técnicos universales en inglés
(RPE, deload, AMRAP, Zone 2) sin importar el idioma de la conversación.
```

### Estrategia para ejercicios (wger)

wger devuelve ejercicios en múltiples idiomas mediante el parámetro `language`:
- `language=4` → español
- `language=2` → inglés

**Implementación:**
1. Al consultar wger, pasar siempre el `language` correspondiente al locale del
   usuario.
2. Si wger no tiene traducción en el idioma pedido, **fallback automático a
   inglés**.
3. Cachear ambas versiones en una tabla local `exercises_cache` para no depender
   de la API en cada render.

```sql
CREATE TABLE exercises_cache (
  wger_id           integer PRIMARY KEY,
  nombre_es         text,
  nombre_en         text,
  descripcion_es    text,
  descripcion_en    text,
  grupo_muscular    text,
  equipamiento      text,
  imagen_url        text,
  updated_at        timestamptz DEFAULT now()
);
```

Refrescar este cache mensualmente con un cron job (`exercises_cache_refresh`).

### Strings de la UI

- Todo string visible al usuario va en `messages/es.json` o `messages/en.json`.
- Nunca hardcodear texto en componentes.
- Las claves siguen estructura jerárquica: `dashboard.metrics.weight`,
  `coach.placeholder`, etc.

---

## 9. SISTEMA DE DISEÑO INICIAL

Mientras tienes tu propio design system, esto te da algo coherente desde el
día 1. Kinética con vibra "datos + biomecánica + premium fitness".

### Modo

**Dark mode first.** Las apps fitness se usan mucho de noche y en gimnasios
con poca luz. El modo claro se añade en una iteración posterior.

### Paleta

```css
/* Backgrounds */
--bg-base:        #0A0E14;    /* casi negro, no puro */
--bg-elevated:    #141A22;    /* tarjetas, modales */
--bg-overlay:     #1E2733;    /* hover, inputs */

/* Borders */
--border-subtle:  #1E2733;
--border-default: #2A3441;

/* Text */
--text-primary:   #E8EEF2;
--text-secondary: #8B98A8;
--text-muted:     #5A6573;

/* Accent — amarillo nitro "sport / high-performance" */
--accent:         #E5FF00;    /* primary action, alta saturación */
--accent-hover:   #C8E000;    /* un punto más profundo para hover */
--accent-pressed: #A8BF00;    /* presionado */
--accent-muted:   #E5FF0015;  /* overlays muy suaves (8% alpha aprox) */
--accent-glow:    #E5FF0040;  /* halo para botones primarios destacados */

/* Texto sobre el acento (CRÍTICO: el amarillo nitro no contrasta con blanco) */
--on-accent:      #0A0E14;    /* texto/iconos sobre fondos amarillos */

/* Status — el éxito NO usa el accent para que se distinga de acciones */
--status-success: #4ADE80;    /* verde lima, complementa sin competir */
--status-warning: #FFB547;    /* ámbar, distinto del accent */
--status-danger:  #FF5757;
--status-info:    #5AB8FF;

/* Métricas de salud (gráficos) — el accent solo para la métrica "estrella" */
--metric-weight:  #5AB8FF;    /* azul */
--metric-muscle:  #E5FF00;    /* accent: la métrica más asociada al progreso */
--metric-fat:     #FFB547;    /* ámbar */
--metric-hrv:     #C77DFF;    /* púrpura */
--metric-sleep:   #7AA8FF;    /* azul suave */
--metric-cardio:  #FF7AB6;    /* rosa */
```

### Tipografía

- **Sans:** `Inter` (Google Fonts). Tipografía neutra, excelente para data.
- **Mono (datos, números, código):** `JetBrains Mono`.
- **Pesos:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold).
- **Tamaños base:** `text-sm` (14px) para UI, `text-base` (16px) para chat,
  `text-2xl` (24px) para números grandes en dashboard, `text-4xl` (36px) para
  KPI hero.

### Componentes shadcn/ui a instalar inicialmente

- `button`, `card`, `input`, `textarea`, `dialog`, `sheet`, `tabs`, `toast`,
  `dropdown-menu`, `select`, `skeleton`, `badge`, `avatar`, `scroll-area`,
  `separator`, `tooltip`.

### Iconografía

`lucide-react` (ya incluido en shadcn/ui). Mismo trazo, peso `1.5`.

### Reglas de uso del accent (amarillo nitro)

El amarillo `#E5FF00` es altamente vibrante. Mal usado satura visualmente. Reglas:

- **Usar para:** botón primario (1 por pantalla idealmente), barra de progreso
  activa, indicador de "serie completada", la métrica hero del dashboard (peso
  o músculo según el bloque del usuario), el cursor de input enfocado, el
  cronómetro de descanso corriendo.
- **No usar para:** texto largo (mata la legibilidad), fondos extensos, bordes
  de tarjetas estándar, iconografía secundaria, mensajes de éxito (usar
  `--status-success` que es verde lima).
- **Texto sobre amarillo:** siempre `--on-accent` (negro `#0A0E14`). El blanco
  sobre amarillo nitro falla WCAG.
- **Glow opcional:** para el CTA principal del onboarding o el botón "Iniciar
  entrenamiento", usar `box-shadow: 0 0 24px var(--accent-glow)` para reforzar
  la sensación "nitro / arranque".

### Animaciones

`framer-motion` para transiciones de pestañas, aparición de tarjetas y el
indicador de "Kai está escribiendo" durante streaming.

---

## 10. OBSERVABILIDAD

### Errores: Sentry

- **Frontend:** `@sentry/nextjs`.
- **Backend (API routes):** ya cubierto por `@sentry/nextjs`.
- **Edge Functions:** `@sentry/deno` o el wrapper oficial para Supabase.
- **Captura mínima requerida:**
  - Excepciones no manejadas.
  - Fallos de llamadas a OpenRouter (con contexto: model, prompt size, error).
  - Fallos de tools de Kai (con user_id y tool_name).
  - Fallos de cron jobs.

### Analytics de producto: PostHog

- Eventos clave a trackear:
  - `app_opened`
  - `onboarding_completed`
  - `workout_started`, `workout_completed`, `workout_abandoned`
  - `plan_generated`
  - `plan_modified_by_user`
  - `biometric_imported` (con `origen_datos` como propiedad)
  - `chat_message_sent`
  - `kai_proactive_message_sent` (con `job_type`)
- **Privacidad:** Self-hosted o EU region. No trackear contenido de mensajes,
  solo eventos.

### Logging estructurado

Para Edge Functions y API routes: logs en JSON con estructura consistente.

```typescript
console.log(JSON.stringify({
  level: "info",
  event: "plan_generated",
  user_id: userId,
  duration_ms: duration,
  model_used: model,
  tokens_used: tokens
}));
```

Supabase recolecta automáticamente estos logs y son consultables desde el
dashboard.

---

## 11. TESTING STRATEGY

Pragmático, no obsesivo. Cobertura donde duele si falla.

### Stack

- **Unit / integration:** `vitest` (más rápido que Jest, mejor DX con Vite).
- **E2E:** `playwright` (un puñado de tests críticos, no más).
- **Component testing:** `@testing-library/react` cuando aplique.

### Qué SÍ testear

- **Parser de Apple Health XML.** Si esto rompe, el usuario pierde datos.
  Tests con fixtures de exports reales (anonimizados).
- **Calculadora de señales de alarma** (sobreentrenamiento, deload, etc.).
  Lógica pura, fácil de testear, alto valor.
- **Validadores zod de structured outputs.** Asegurar que rechazan inputs
  malformados.
- **Tools de Kai que mutan datos** (`register_injury`, `modify_current_plan`,
  `log_biometric_entry`). Integration tests con BD de test.
- **Cron jobs core** (generación de plan semanal, recordatorios).
- **1 happy path E2E:** signup → onboarding → primer workout → ver dashboard.

### Qué NO testear (en v1)

- Componentes de UI individuales sin lógica.
- El LLM en sí (no es determinístico, no tiene sentido).
- Cubrir 100% del código. Optimizar para valor, no para métrica.

### Estrategia con LLM

Para tools que dependen del LLM, los tests no validan el contenido del output
sino que:
1. El schema del output se respeta (zod validation pasa).
2. Las tools llamadas son las esperadas.
3. Los efectos en BD ocurren.

---

## 12. DISCLAIMER MÉDICO

### Texto del disclaimer (español)

Mostrado durante el onboarding y aceptado explícitamente antes de continuar:

> **Aviso importante**
>
> Kinética es una herramienta de entrenamiento y seguimiento personal. No
> sustituye el consejo, diagnóstico o tratamiento de un profesional de la
> salud cualificado.
>
> Kai, el coach virtual, ofrece sugerencias basadas en principios generales
> de entrenamiento y en los datos que tú compartes. Sus recomendaciones no
> son consejo médico.
>
> Antes de empezar cualquier programa de entrenamiento, especialmente si
> tienes condiciones médicas preexistentes, lesiones o llevas tiempo sin
> actividad física regular, consulta con tu médico.
>
> Si experimentas dolor agudo, mareos, dificultad para respirar o cualquier
> síntoma preocupante durante el ejercicio, detente y busca atención médica.
>
> Al usar Kinética aceptas que la información que recibes es de carácter
> educativo y motivacional, y que la responsabilidad final sobre tu salud y
> entrenamiento es tuya.

### Texto en inglés

> **Important notice**
>
> Kinética is a personal training and tracking tool. It does not replace
> qualified medical advice, diagnosis, or treatment.
>
> Kai, the virtual coach, offers suggestions based on general training
> principles and the data you share. Its recommendations are not medical
> advice.
>
> Before starting any training program, especially if you have pre-existing
> medical conditions, injuries, or have been inactive for some time, consult
> your doctor.
>
> If you experience sharp pain, dizziness, breathing difficulty, or any
> concerning symptoms during exercise, stop and seek medical attention.
>
> By using Kinética you accept that the information you receive is educational
> and motivational in nature, and that the ultimate responsibility for your
> health and training is yours.

### Implementación

- Schema: añadir columna a `user_profiles`:
  ```sql
  ALTER TABLE user_profiles ADD COLUMN disclaimer_accepted_at timestamptz;
  ```
- Si `disclaimer_accepted_at IS NULL`, mostrar pantalla bloqueante antes del
  onboarding con scroll obligatorio + checkbox + botón "Acepto y continúo".
- Guardar la timestamp del momento de aceptación para auditoría.
- En el footer del chat de Kai, un link discreto "Aviso médico" que abra el
  texto completo.

---

## 13. CHECKLIST PRE-SPRINT-1

Antes de que el agente arranque a programar:

- [ ] Crear proyecto en Supabase con plan `Pro` (para PITR y mejor performance).
- [ ] Crear proyecto en Vercel conectado a tu repo de GitHub.
- [ ] Crear cuenta y proyecto en Sentry.
- [ ] Crear cuenta en PostHog (cloud o self-hosted).
- [ ] Generar API key de OpenRouter, agregar crédito inicial ($20 alcanzan
      bastante).
- [ ] Generar API key de YouTube Data API v3.
- [ ] Generar VAPID keys con `npx web-push generate-vapid-keys`.
- [ ] Cargar todos los env vars en Vercel y Supabase según sección 1.
- [ ] Reservar dominio (sugerencia: `kinetica.app` o similar). Configurar DNS
      hacia Vercel.
- [ ] Crear repo en GitHub. Estructura monorepo no es necesaria, Next.js solo
      alcanza.

---

## 14. ORDEN DE ENTREGA DE DOCUMENTOS AL AGENTE

Al iniciar el desarrollo, entregar al agente de código en este orden:

1. **`kinetica_prd_v2.md`** — visión, arquitectura, schema, sprints.
2. **`kai_identity.md`** — todo lo del agente conversacional.
3. **`kinetica_setup.md`** (este documento) — decisiones técnicas finales,
   schemas faltantes, env vars, i18n, design system, testing, disclaimer.

Indicarle al agente: "Lee los tres documentos antes de hacer cualquier cosa.
Trátalos como fuente única de verdad. Si encuentras ambigüedad, pregunta antes
de asumir."
