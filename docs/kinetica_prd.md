# 📋 DOCUMENTO DE ESPECIFICACIÓN TÉCNICA (PRD v2)

## PROYECTO: Kinética — AI-Powered Fitness Coach PWA

---

## 1. RESUMEN DEL SISTEMA

**Kinética** es una Progressive Web App (PWA) multiusuario de entrenamiento y salud,
potenciada por un agente conversacional de IA llamado **Kai** (nombre técnico interno:
**K.A.I.** — *Kinetic Artificial Intelligence*).

La app:

- Genera planes semanales estructurados de entrenamiento adaptados al perfil del usuario.
- Registra entrenamientos mediante una interfaz mobile-first optimizada para el gimnasio.
- Realiza seguimiento de métricas de composición corporal de forma **agnóstica al hardware**
  (no asume Arboleaf ni Apple Health específicamente; trabaja sobre la data, no sobre el
  proveedor).
- Cuenta con un coach virtual (Kai) que es proactivo, técnico, empático y motivador.

### Stack tecnológico mandatorio

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript |
| Estilos | Tailwind CSS + shadcn/ui |
| Backend / DB / Auth / Storage | Supabase |
| Scheduling | Supabase Edge Functions + `pg_cron` |
| LLM Provider | OpenRouter (modelos con structured outputs y tool calling) |
| Hosting | Vercel |
| Catálogo de ejercicios | wger.de REST API (open source) |
| Videos demostrativos | YouTube Data API v3 (cacheados en BD propia) |

---

## 2. ARQUITECTURA DE LA INTERFAZ (UI/UX)

App PWA mobile-first con barra de navegación inferior fija de **3 tabs**:

### Tab 1 — Dashboard
- Gráficas de tendencias (peso, % grasa, % músculo, últimos 30/90/365 días).
- Estado del bloque actual (adherencia semanal, días completados, volumen acumulado).
- Tarjeta de alertas/notas activas emitidas por Kai.
- Botón "Añadir pesaje manual" + botón "Importar datos de salud".

### Tab 2 — Plan
- Calendario semanal generado por Kai (vista de 7 días).
- Modo ejecución "En el Ruedo" para el día actual:
  - Lista de ejercicios con descripción anatómica (wger.de) e imagen.
  - Video embebido (YouTube cacheado).
  - Inputs grandes con botones +/- para registrar peso y reps.
  - Botón "Completar serie" → dispara temporizador de descanso automáticamente.
  - Temporizador flotante visible en todo momento.

### Tab 3 — Coach
- Chat estilo WhatsApp/Telegram con Kai.
- Soporte para adjuntar archivos (PDF, CSV, XML, imágenes).
- Mensajes proactivos de Kai aparecen con indicador visual.

---

## 3. DISEÑO DE BASE DE DATOS (SUPABASE SCHEMA)

Todas las tablas tienen **Row Level Security (RLS)** habilitado. Las políticas garantizan
que cada usuario solo accede a sus propios datos (`user_id = auth.uid()`).

### `user_profiles`

```sql
id                      uuid PRIMARY KEY REFERENCES auth.users(id)
nombre                  text NOT NULL
email                   text
timezone                text NOT NULL DEFAULT 'America/Caracas'  -- crítico para cron jobs
onboarding_completed    boolean DEFAULT false
metadata_biometrica     jsonb  -- edad, altura, lesiones, objetivos, equipamiento, nivel
created_at              timestamptz DEFAULT now()
updated_at              timestamptz DEFAULT now()
```

### `biometrics_history`
Agnóstica al proveedor. Snapshot de composición corporal completa (típicamente de una
báscula inteligente como Arboleaf, Withings, Renpho, Garmin, etc.). La columna
`origen_datos` documenta de dónde vino el dato.

```sql
id                          uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id                     uuid REFERENCES auth.users(id) ON DELETE CASCADE
fecha                       date NOT NULL
hora                        time  -- opcional, útil para distinguir pesajes del mismo día

-- Métricas primarias
peso_kg                     numeric(5,2)
imc                         numeric(4,2)

-- Composición corporal
porcentaje_grasa            numeric(4,2)
porcentaje_musculo          numeric(4,2)  -- masa muscular esquelética
porcentaje_agua             numeric(4,2)
porcentaje_proteina         numeric(4,2)
masa_osea_kg                numeric(4,2)
masa_libre_grasa_kg         numeric(5,2)
masa_grasa_kg               numeric(5,2)
grasa_visceral              numeric(4,1)  -- escala numérica (típicamente 1-30)

-- Métricas metabólicas
metabolismo_basal_kcal      integer
edad_metabolica             integer
tipo_cuerpo                 text  -- 'atletico', 'musculoso', 'delgado', etc.

-- Trazabilidad
origen_datos                text NOT NULL  -- 'manual', 'apple_health_xml', 'csv_import', 'pdf_bascula', 'shortcut_ios'
raw_data                    jsonb  -- backup del dato original tal como vino del proveedor
created_at                  timestamptz DEFAULT now()

UNIQUE (user_id, fecha, hora, origen_datos)  -- evita duplicados en re-imports
```

**Nota:** todos los campos son nullable porque diferentes básculas miden diferentes
métricas. El parser debe llenar solo lo que reciba.

### `health_metrics`
Tabla genérica para métricas de salud que vienen de wearables (Apple Watch, Garmin,
Whoop, Oura, etc.) o de Apple Health / Google Fit / Health Connect. Diseñada para
ser extensible: cuando aparezca una métrica nueva, no se toca el schema.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE
fecha           date NOT NULL
hora            time  -- opcional para métricas con timestamp preciso
tipo_metrica    text NOT NULL  -- ver catálogo abajo
valor_numerico  numeric(10,3)
valor_texto     text  -- para métricas no numéricas o complementarias
unidad          text  -- 'ms', 'bpm', 'horas', 'pasos', 'kcal', etc.
origen_datos    text NOT NULL  -- 'apple_health_xml', 'manual', 'shortcut_ios', etc.
metadata        jsonb  -- data adicional estructurada (ej. fases del sueño, segmentos)
created_at      timestamptz DEFAULT now()

UNIQUE (user_id, fecha, hora, tipo_metrica, origen_datos)
```

**Catálogo de `tipo_metrica` soportados en v1** (extensible):

| `tipo_metrica` | Unidad | Frecuencia | Descripción |
|---|---|---|---|
| `hrv` | ms | Diario | Variabilidad de frecuencia cardíaca (SDNN o RMSSD) |
| `fc_reposo` | bpm | Diario | Frecuencia cardíaca en reposo |
| `vo2max` | ml/kg/min | Semanal | Capacidad aeróbica estimada |
| `sueno_total_horas` | horas | Diario | Horas totales dormidas |
| `sueno_profundo_horas` | horas | Diario | Tiempo en sueño profundo |
| `sueno_rem_horas` | horas | Diario | Tiempo en REM |
| `sueno_calidad` | score 0-100 | Diario | Score sintético de calidad |
| `pasos` | pasos | Diario | Pasos del día |
| `calorias_activas` | kcal | Diario | Gasto calórico por actividad |
| `minutos_ejercicio` | min | Diario | Minutos de ejercicio (umbral Apple Watch) |
| `frecuencia_respiratoria` | rpm | Diario | Respiraciones por minuto en reposo |
| `nivel_estres` | score 0-100 | Diario | Si el wearable lo provee (Garmin, Whoop) |
| `temperatura_corporal` | °C | Diario | Si el wearable lo provee |
| `saturacion_oxigeno` | % | Diario | SpO2 |

El system prompt de Kai debe conocer este catálogo para saber qué consultar.

### `weekly_plans`

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE
semana_inicio   date NOT NULL  -- siempre lunes
estado          text NOT NULL DEFAULT 'active'  -- 'active', 'completed', 'archived'
plan_json       jsonb NOT NULL  -- ver schema en sección 6
notas_bloque    text  -- texto libre escrito por Kai
created_at      timestamptz DEFAULT now()

UNIQUE (user_id, semana_inicio)
```

### `workout_logs`
Registro real de lo ejecutado.

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE
weekly_plan_id      uuid REFERENCES weekly_plans(id)
fecha               date NOT NULL
ejercicio_wger_id   integer
ejercicio_nombre    text NOT NULL
sets                jsonb NOT NULL  -- [{"set": 1, "reps": 10, "peso": 80, "rpe": 8, "completado": true}]
notas_usuario       text
created_at          timestamptz DEFAULT now()
```

### `chat_messages`
Historial conversacional con Kai.

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE
role        text NOT NULL  -- 'user' | 'assistant' | 'system'
content     text NOT NULL
metadata    jsonb  -- adjuntos, tool calls, etc.
created_at  timestamptz DEFAULT now()
```

### `chat_summaries`
Memoria de largo plazo. Resúmenes generados automáticamente cada N mensajes.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE
resumen         text NOT NULL  -- "El usuario reportó dolor de hombro el 12/05..."
rango_inicio    timestamptz NOT NULL
rango_fin       timestamptz NOT NULL
mensaje_count   integer
created_at      timestamptz DEFAULT now()
```

### `exercise_video_cache`
Cache de videos de YouTube para no repetir búsquedas.

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
ejercicio_wger_id   integer
ejercicio_nombre    text NOT NULL
youtube_video_id    text NOT NULL
title               text
duration_seconds    integer
calidad_validada    boolean DEFAULT false  -- true si Kai lo curó manualmente
created_at          timestamptz DEFAULT now()

UNIQUE (ejercicio_wger_id)
```

### `proactive_jobs_log`
Bitácora de notificaciones/jobs proactivos disparados, para no duplicar.

```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE
job_type    text NOT NULL  -- 'weekly_plan_generator', 'weigh_in_reminder', etc.
ejecutado_at timestamptz DEFAULT now()
resultado   jsonb
```

---

## 4. INTEGRACIÓN BIOMÉTRICA Y DE SALUD AGNÓSTICA

**Premisa de diseño:** la app nunca depende de un proveedor específico de báscula o de
ecosistema de salud. Toda data se normaliza en dos destinos:

- **`biometrics_history`** — snapshots de composición corporal (típicamente de una báscula
  inteligente: peso, grasa, músculo, agua, grasa visceral, BMR, edad metabólica, etc.).
- **`health_metrics`** — métricas de salud y recuperación que vienen de wearables o del
  ecosistema de salud (HRV, sueño, FC en reposo, pasos, VO2max, etc.).

Cuando el parser procesa un archivo (XML de Apple Health, CSV, PDF de báscula), inserta
en ambas tablas según corresponda a cada métrica.

### Métodos de ingreso soportados (v1)

| Método | Qué data ingresa | Destino | Prioridad |
|---|---|---|---|
| **Input manual** | Pesaje rápido (peso, %grasa, %músculo). | `biometrics_history` | Alta |
| **Export XML de Apple Health** | Composición corporal + HRV + sueño + FC reposo + pasos + VO2max + minutos ejercicio + todo lo que Apple Health agregue. | Ambas tablas | Alta |
| **CSV genérico** | Tabular flexible. Kai detecta columnas y mapea. | Ambas tablas según columnas | Media |
| **PDF de báscula** | Reporte mensual (ej. Arboleaf, Withings). Kai usa visión del LLM. | `biometrics_history` | Media |

### Parser de Apple Health XML

El export de Apple Health genera un zip con `export.xml` que puede pesar cientos de MB.
El parser debe:

1. Procesar el XML en **streaming** (no cargar todo en memoria). Usar SAX o similar.
2. Filtrar por tipos relevantes:
   - `HKQuantityTypeIdentifierBodyMass` → `biometrics_history.peso_kg`
   - `HKQuantityTypeIdentifierBodyFatPercentage` → `biometrics_history.porcentaje_grasa`
   - `HKQuantityTypeIdentifierLeanBodyMass` → `biometrics_history.masa_libre_grasa_kg`
   - `HKQuantityTypeIdentifierBodyMassIndex` → `biometrics_history.imc`
   - `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` → `health_metrics` (tipo `hrv`)
   - `HKQuantityTypeIdentifierRestingHeartRate` → `health_metrics` (tipo `fc_reposo`)
   - `HKQuantityTypeIdentifierVO2Max` → `health_metrics` (tipo `vo2max`)
   - `HKQuantityTypeIdentifierStepCount` → `health_metrics` (tipo `pasos`)
   - `HKQuantityTypeIdentifierActiveEnergyBurned` → `health_metrics` (tipo `calorias_activas`)
   - `HKQuantityTypeIdentifierAppleExerciseTime` → `health_metrics` (tipo `minutos_ejercicio`)
   - `HKQuantityTypeIdentifierRespiratoryRate` → `health_metrics` (tipo `frecuencia_respiratoria`)
   - `HKQuantityTypeIdentifierOxygenSaturation` → `health_metrics` (tipo `saturacion_oxigeno`)
   - `HKCategoryTypeIdentifierSleepAnalysis` → `health_metrics` (tipos de sueño, agregados por noche)
3. Bulk insert con `ON CONFLICT DO NOTHING` (gracias al UNIQUE composite) para que
   re-imports sean idempotentes.
4. Reportar a Kai cuántos registros nuevos se añadieron por tipo.

**Recomendación de implementación:** ejecutar el parser en una Supabase Edge Function
con un límite de tiempo extendido, no en el cliente (los XML pueden ser muy grandes).

### Métodos diferidos a v2

- **Shortcut de iOS**: atajo que lee HealthKit y hace POST a un endpoint Supabase. Permite
  sincronización diaria automática sin que el usuario tenga que exportar manualmente.
- **Health Connect (Android)**: API nativa de Google. Investigar si una PWA con permisos
  apropiados puede acceder.

### Importante sobre Apple Health desde PWA

**No existe** una Web API que permita leer HealthKit desde Safari o desde una PWA. Cualquier
mención en el chat original de "API de acceso a datos de salud del navegador" era incorrecta.
Las opciones reales son las listadas arriba. Comunicar esto al usuario en el onboarding.

---

## 5. CATÁLOGO DE EJERCICIOS Y VIDEOS

### Fuente primaria: wger.de
- Endpoint: `https://wger.de/api/v2/exercise/`
- Provee: nombre, descripción anatómica, grupo muscular, equipamiento, imágenes.
- Idioma: filtrar por `language=4` (español) con fallback a `language=2` (inglés).

### Videos demostrativos: pipeline en cascada

1. **Cache hit en `exercise_video_cache`** → usar directamente.
2. **Cache miss** → llamar a YouTube Data API v3 con query:
   `"{nombre_ejercicio} correct form technique"`
   Filtros: duración `< 4min`, ordenado por relevancia.
   Tomar primer resultado, guardarlo en cache.
3. **Usuario reporta "video malo"** → invocar a Kai con tool call `find_better_video`,
   el LLM busca y propone alternativa, se actualiza cache con `calidad_validada = true`.

### Costo de YouTube Data API
- Quota gratuita: 10,000 unidades/día.
- Búsqueda cuesta 100 unidades → 100 búsquedas/día gratis.
- Con cache agresivo, esto sobra para decenas de usuarios.

---

## 6. STRUCTURED OUTPUTS — GENERACIÓN DEL PLAN SEMANAL

### Por qué structured outputs

OpenRouter soporta `response_format: { type: "json_schema" }` con modelos como
Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro. Esto garantiza que el output del LLM
respeta exactamente el schema definido, eliminando errores de parseo.

**No usar** generación de "JSON en texto libre" parseado con `JSON.parse()`. Es frágil.

### Schema del plan semanal

```json
{
  "type": "object",
  "required": ["semana_inicio", "dias", "notas_bloque"],
  "properties": {
    "semana_inicio": { "type": "string", "format": "date" },
    "notas_bloque": { "type": "string" },
    "dias": {
      "type": "array",
      "minItems": 7,
      "maxItems": 7,
      "items": {
        "type": "object",
        "required": ["dia", "tipo", "es_descanso", "ejercicios"],
        "properties": {
          "dia": { "type": "string", "enum": ["lunes","martes","miercoles","jueves","viernes","sabado","domingo"] },
          "tipo": { "type": "string" },
          "es_descanso": { "type": "boolean" },
          "duracion_estimada_min": { "type": "integer" },
          "ejercicios": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["wger_id", "nombre", "sets", "reps_objetivo", "descanso_seg"],
              "properties": {
                "wger_id": { "type": "integer" },
                "nombre": { "type": "string" },
                "sets": { "type": "integer" },
                "reps_objetivo": { "type": "string" },
                "peso_sugerido_kg": { "type": "number" },
                "rpe_objetivo": { "type": "integer", "minimum": 1, "maximum": 10 },
                "descanso_seg": { "type": "integer" },
                "notas_kai": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 7. MEMORIA DEL COACH — ARQUITECTURA EN TRES CAPAS

Cada llamada al LLM se construye dinámicamente con las tres capas concatenadas en el
system prompt + messages array.

### Capa 1 — Contexto estructurado (siempre presente)

Generado on-the-fly a partir de la BD. Se inyecta en el system prompt:

```
=== ESTADO ACTUAL DEL USUARIO ===
Perfil: [extracto de user_profiles.metadata_biometrica]
Últimos 3 pesajes: [query a biometrics_history]
Métricas de salud recientes: [HRV, sueño, FC reposo últimos 7 días de health_metrics]
Plan semanal activo: [resumen de weekly_plans.plan_json]
Entrenamientos últimos 7 días: [query a workout_logs]
Lesiones activas: [del perfil]
==================================
```

### Capa 2 — Ventana deslizante de chat reciente

Últimos **20 mensajes** de `chat_messages` ordenados cronológicamente, pasados al LLM
en el array `messages`.

### Capa 3 — Resúmenes de largo plazo

- **Trigger:** cuando `chat_messages` acumula 30+ mensajes desde el último resumen.
- **Job en background:** Edge Function llama al LLM con prompt:
  > "Resume estos 30 mensajes en máximo 200 palabras, priorizando: lesiones reportadas,
  > cambios de objetivos, hitos de progreso, decisiones de programación importantes."
- Se guarda en `chat_summaries`.
- Los resúmenes más recientes (últimos 3-5) se inyectan en el system prompt como
  "Notas de sesiones anteriores".

### Evolución futura (v2)
Cuando el historial sea muy grande, migrar Capa 3 a embeddings + pgvector para búsqueda
semántica selectiva. **No implementar en v1.**

---

## 8. PROACTIVIDAD — CRON JOBS

Todos los jobs corren como Supabase Edge Functions invocadas por `pg_cron`. Cada job
respeta la `timezone` del usuario (no dispara a las 8am UTC para todos).

### Jobs definidos

| Job | Cuándo | Acción |
|---|---|---|
| `weekly_plan_generator` | Domingo 18:00 hora local | Si no hay plan activo para la próxima semana, genera uno con el LLM y notifica al usuario |
| `weigh_in_reminder` | Sábado 8:00 hora local | Si no hay registro en `biometrics_history` en los últimos 7 días, manda push reminder |
| `post_workout_checkin` | 2h después de un `workout_log` insertado (vía trigger) | Mensaje opcional de Kai preguntando cómo se sintió |
| `deload_detector` | Lunes 6:00 hora local | Si RPE promedio últimas 2 semanas ≥ 9 o adherencia cayó >30%, Kai sugiere semana de descarga |
| `chat_summary_generator` | Cada hora | Detecta usuarios con 30+ mensajes nuevos desde último resumen, genera resumen |

Cada ejecución se loguea en `proactive_jobs_log` para evitar duplicados.

### Notificaciones push (Web Push API)

- Implementar service worker con suscripción push estándar.
- Guardar `endpoint`, `p256dh`, `auth` keys del browser en tabla `push_subscriptions`.
- **Limitación iOS:** Web Push solo funciona en iOS 16.4+ y **solo si la PWA está instalada
  en home screen**. Comunicar esto en el onboarding con instrucciones claras.
- **Android:** funciona en cualquier navegador moderno.

---

## 9. PERSONALIDAD DEL AGENTE (KAI) — SYSTEM PROMPT

Ver documento separado **"Identidad y personalidad de K.A.I. / Kai"** ya definido.
El system prompt completo se construye en runtime con:

```
[Identidad y personalidad de Kai — texto fijo]
+
[Capa 1: contexto estructurado del usuario — dinámico]
+
[Capa 3: últimos 3-5 resúmenes de chat — dinámico]
+
[Instrucciones específicas del flujo actual — onboarding / plan / chat libre]
```

### Tool calls disponibles para Kai

El agente tiene estas funciones que puede invocar:

| Tool | Cuándo | Efecto |
|---|---|---|
| `update_user_profile` | Usuario revela nuevo dato relevante | Actualiza `user_profiles.metadata_biometrica` |
| `log_biometric_entry` | Usuario reporta peso/composición verbalmente | Inserta en `biometrics_history` con origen `manual` |
| `log_health_metric` | Usuario reporta HRV, sueño u otra métrica de salud verbalmente | Inserta en `health_metrics` |
| `generate_weekly_plan` | Inicio de semana o usuario pide replanificación completa | Crea nuevo registro en `weekly_plans` con structured output |
| `modify_current_plan` | Usuario pide ajustar rutina del día o semana | Actualiza `weekly_plans.plan_json` |
| `register_injury` | Usuario reporta dolor/molestia nueva | Añade lesión activa al perfil + ajusta plan |
| `resolve_injury` | Usuario confirma que dolor/molestia ya no existe | Marca lesión como resuelta en el perfil |
| `find_better_video` | Usuario reporta video malo | Busca alternativa en YouTube, actualiza cache con `calidad_validada=true` |
| `parse_biometric_file` | Usuario sube archivo XML/CSV/PDF | Parsea y bulk-insert en `biometrics_history` y/o `health_metrics` |
| `query_progress_summary` | Usuario pregunta sobre su evolución | Ejecuta queries específicas y genera resumen analítico |

---

## 10. ONBOARDING CONVERSACIONAL

Primera vez que un usuario entra después del signup:

1. Pantalla minimalista, directo al chat con Kai.
2. Kai abre con saludo y arranca entrevista guiada (NO formulario).
3. Kai debe extraer (en orden flexible, conversacional):
   - Objetivo principal (fuerza, hipertrofia, pérdida de grasa, salud general, rendimiento)
   - Edad, altura, peso actual
   - Nivel de experiencia (principiante / intermedio / avanzado)
   - Días disponibles por semana y minutos por sesión
   - Equipamiento disponible (gimnasio comercial / home gym / solo peso corporal)
   - Lesiones o molestias activas
   - Preferencias y aversiones de ejercicios
4. Al terminar, Kai llama `update_user_profile` y `weekly_plan_generator` para crear
   el primer plan.
5. Marca `onboarding_completed = true`.

---

## 11. SEGURIDAD Y MULTIUSUARIO

- **Auth:** Supabase Auth con email + password (magic link opcional).
- **RLS:** todas las tablas filtran por `auth.uid()`. Políticas SELECT/INSERT/UPDATE/DELETE
  explícitas para cada tabla.
- **Edge Functions:** validan `auth.uid()` antes de cualquier operación cross-user.
- **Storage:** bucket por usuario para archivos subidos (XML, PDFs). Acceso restringido
  vía signed URLs.
- **API keys:** OpenRouter y YouTube API guardadas en Supabase Vault o env vars de
  Vercel, nunca expuestas al frontend.

---

## 12. ROADMAP DE IMPLEMENTACIÓN SUGERIDO

### Sprint 1 — Foundation
- Schema de BD + RLS
- Auth + signup/login
- Layout PWA con 3 tabs vacías
- Service worker básico + manifest

### Sprint 2 — Coach mínimo viable
- Chat funcional con OpenRouter
- Capa 1 y 2 de memoria
- Onboarding conversacional
- Tool: `update_user_profile`

### Sprint 3 — Plan generator
- Structured outputs para plan semanal
- Tab Plan con renderizado del plan
- Integración con wger.de
- Cache de videos YouTube

### Sprint 4 — Ejecución y logging
- Modo "En el Ruedo" con inputs +/-
- Temporizador de descanso
- Registro en `workout_logs`
- Tools: `modify_current_plan`, `register_injury`

### Sprint 5 — Biometría y salud
- Input manual + Dashboard con gráficas (composición + recuperación)
- Parser de Apple Health XML (streaming, ambas tablas)
- Tool: `log_biometric_entry`, `parse_biometric_file`
- Visualización de tendencias de HRV, sueño, FC reposo

### Sprint 6 — Proactividad
- Cron jobs (weekly plan, weigh in reminder)
- Web Push notifications
- Capa 3 de memoria (resúmenes)
- Deload detector

### Sprint 7 — Pulido
- Multi-usuario testing (tú + Giovanna + amigos)
- Performance, offline support
- Refinamiento del system prompt de Kai

---

## 13. CONSIDERACIONES OPERATIVAS

- **Costos LLM (estimado):** ~$5-15/mes por usuario activo con uso moderado, usando
  Claude 3.5 Sonnet o GPT-4o vía OpenRouter. Asumidos por el owner en v1.
- **Modelos recomendados:**
  - Plan generation + tool calling: `anthropic/claude-3.5-sonnet` o `openai/gpt-4o`
  - Chat conversacional: mismo modelo (consistencia)
  - Parseo de PDFs con visión: `anthropic/claude-3.5-sonnet`
- **Backup:** Supabase tiene PITR (point-in-time recovery) en plan Pro. Considerar
  cuando haya más de 3 usuarios activos.

---

## ANEXO A — CÓMO USA KAI LAS MÉTRICAS DE SALUD

Esta sección documenta cómo el agente debe interpretar y actuar sobre cada métrica.
**Debe ser parte del system prompt de Kai** (o referenciada en él) para que sus decisiones
sean consistentes y basadas en evidencia.

### Métricas de composición corporal (`biometrics_history`)

| Métrica | Cómo la usa Kai |
|---|---|
| **Peso** | Tracking de tendencia. No reacciona a fluctuaciones diarias (<2kg), sí a tendencias semanales. |
| **% Grasa corporal** | Si sube en bloque de definición, ajusta déficit calórico o sugiere más cardio. Si baja en bloque de volumen, valida que la ganancia sea "limpia". |
| **% Músculo esquelético** | Mide directamente la efectividad del programa de fuerza. Si está estancado >4 semanas con entrenamiento adecuado, sospecha de déficit proteico o de recuperación. |
| **% Agua corporal** | Bajo (<50% hombre, <45% mujer) = sospecha de deshidratación, Kai recuerda hidratación. Fluctuaciones grandes día a día explican variaciones de peso. |
| **Grasa visceral** | Si está alta (>10 en escala típica), Kai prioriza cardio aeróbico y déficit calórico aunque el objetivo principal sea otro. Es un marcador de salud crítico. |
| **Masa ósea** | Tracking de largo plazo. Caídas sostenidas en mujeres adultas → sugerir consulta médica. Entrenamiento con carga ayuda a mantenerla. |
| **% Proteína corporal** | Si está bajo en contexto de entrenamiento de fuerza, Kai pregunta sobre ingesta proteica. |
| **BMR (metabolismo basal)** | Base para calcular necesidades calóricas. Si baja significativamente, posible signo de adaptación metabólica a déficit prolongado → sugerir diet break. |
| **Edad metabólica** | Métrica motivacional. Kai la usa en mensajes de progreso ("tu edad metabólica bajó 3 años desde que empezamos"). |
| **Masa libre de grasa** | Métrica más estable que % músculo. Útil para tracking de hipertrofia neta. |
| **IMC** | Métrica limitada. Kai la menciona solo en contexto, nunca como objetivo aislado. |

### Métricas de recuperación y actividad (`health_metrics`)

| Métrica | Cómo la usa Kai |
|---|---|
| **HRV** | **Indicador #1 de recuperación.** Si bajó >15% del baseline del usuario por 2+ días, Kai reduce intensidad del día. Si está consistentemente baja por una semana, sugiere deload. |
| **FC en reposo** | Sube cuando estás fatigado o enfermo. Si sube >5bpm sobre baseline → señal de sobreentrenamiento o enfermedad incipiente, Kai propone descanso. |
| **VO2max** | Capacidad aeróbica. Tracking de largo plazo. Si está bajo y el objetivo incluye salud, Kai añade trabajo cardiovascular Zona 2. |
| **Sueño total** | Si <6h la noche anterior → Kai propone reducir intensidad del entrenamiento de hoy o mover el día pesado. |
| **Sueño profundo + REM** | Marcadores de calidad. Si son consistentemente bajos, Kai sugiere higiene del sueño aunque las horas totales sean buenas. |
| **Pasos diarios** | Mide NEAT (gasto fuera del gym). Si está bajo (<5000) en bloque de pérdida de grasa, Kai sugiere aumentarlos antes que tocar la dieta. |
| **Calorías activas** | Complementa el cálculo de gasto total. |
| **Minutos de ejercicio** | Validación cruzada con `workout_logs`. Si Apple Health registra entrenamiento que no está logueado, Kai pregunta qué hiciste. |
| **Frecuencia respiratoria** | Elevada en reposo → posible estrés o enfermedad. Kai lo menciona si el patrón es claro. |
| **SpO2** | Caídas anómalas en reposo merecen atención médica. Kai no diagnostica pero sí alerta. |
| **Temperatura corporal** | Elevación sostenida → Kai sugiere descansar y consultar médico si persiste. |
| **Nivel de estrés** | Si el wearable lo provee, Kai lo cruza con HRV y sueño para tomar decisiones de programación. |

### Reglas de decisión combinadas

Estas son señales compuestas que Kai debe reconocer y usar proactivamente:

| Señal | Combinación | Acción de Kai |
|---|---|---|
| **Sobreentrenamiento** | HRV bajo + FC reposo subiendo + RPE alto últimas 2 semanas | Programar deload de 1 semana automáticamente. Notificar al usuario y explicar por qué. |
| **Recuperación insuficiente puntual** | Sueño <6h anoche + HRV bajo hoy | Sugerir mover el día pesado, hacer sesión más ligera o moverla |
| **Progreso muscular estancado** | Peso estable + %músculo estable >4 semanas + adherencia >80% | Preguntar sobre proteína y sueño. Considerar aumentar volumen o cambiar de bloque. |
| **Pérdida de músculo en déficit** | Bloque de definición + %músculo bajando >0.5% por semana | Reducir déficit calórico, mantener intensidad del entrenamiento de fuerza. |
| **Adaptación metabólica** | BMR bajó significativamente + meseta de peso en déficit | Sugerir diet break de 1-2 semanas en mantenimiento. |
| **Salud cardiovascular en riesgo** | Grasa visceral alta + FC reposo alta + VO2max bajo | Priorizar cardio Zona 2 aunque el objetivo principal sea otro. Explicar el por qué. |

### Filosofía de uso

Kai **no diagnostica**. Cuando vea señales de problemas médicos serios (caídas anómalas
de SpO2, temperaturas elevadas sostenidas, patrones cardíacos extraños), su respuesta
debe ser: "estos datos sugieren algo que vale la pena revisar con un médico, yo no puedo
diagnosticar pero sí lo puedo señalar".

