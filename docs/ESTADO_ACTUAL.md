# ESTADO ACTUAL — Kinética (Handoff técnico, 5 Jun 2026)

> Documento para el próximo agente que retome el proyecto. Lee `TODO.md` primero (estado funcional resumido) y luego este (detalles técnicos).

---

## TL;DR

- El proyecto está **funcional**: auth, chat de Kai sin bucle, onboarding determinístico, generación de plan con ejercicios reales de wger.de, "En el Ruedo", progreso y temas seleccionables.
- **Sesión 3-5 Jun (esta): loop de progresión por RPE + récords + biometría manual + plan-model v2 (superseries y mesociclos). TODO está en producción.** Último release `3039f7d` (superseries + mesociclos); previo `c877c8a` (RPE/récords/biometría). Detalle abajo.
- **Git**: `main` y `develop` al día y pusheados. Producción despliega de `main` (verificado: deploys salen con `target: production`). **Migración `003_mesocycles.sql` aplicada en Supabase.** Rama abierta sin mergear: **`feature/exercise-videos`** (vídeos YouTube, dormido hasta `YOUTUBE_API_KEY`).
- Producción: https://kinetica-delta.vercel.app · Supabase: `focbdmounzgaujtirvno`.
- **A vigilar**: (1) la progresión por RPE delega la decisión en el LLM (Haiku) — verificar en uso real que aplica los ajustes con consistencia (red de seguridad determinística preparable en `lib/progression.ts`). (2) Récords, biometría, superseries y mesociclos están en prod pero **sin probar en navegador** todavía.

---

## Sesión del 3-5 Jun 2026 (esta)

1. **Loop de progresión por RPE** (rama `feature/progression-loop`, mergeada y borrada):
   - **Pieza A — captura**: `SerieRegistro.rpe?` + selector "Esfuerzo: Fácil/Justo/Duro" (→ RPE 6/8/10) en `exercise-tracker.tsx`, aparece al completar la serie. Se guarda en `workout_logs.sets` (jsonb), sin migración. Validado en `app/api/workout/log/route.ts`.
   - **Pieza B — cerebro**: `lib/progression.ts` (`buildProgressionSummary` pura + `getProgressionSummary` con BD + `progressionSignal`) resume plan-vs-realidad de la semana en curso. `lib/plan.ts` inyecta ese resumen + la "regla 7" de progresión en el system prompt. Tests en `tests/progression.test.ts` (13).
2. **Récords e historial por ejercicio** (subagente en worktree, cherry-pick): `lib/records.ts`, `app/api/progress/records`, `components/progress/exercise-records.tsx`, página `/progress`. e1RM Epley, PRs. Tests (13).
3. **Biometría manual** (subagente en worktree, cherry-pick): `lib/biometrics.ts` + `lib/biometrics-server.ts`, `app/api/biometrics`, `components/biometrics/*`, página `/biometrics`. `biometrics_history` ya existía (sin migración). Tests (12).
4. **Coherencia de nav**: nav a 3 (Inicio/Plan/Coach); Cuerpo y Récords como cards del dashboard (`dashboard-view.tsx`).
5. **Decisión de catálogo**: se evaluó ExerciseDB API y se descartó (de pago/RapidAPI, sin self-host, licencia de media no declarada). Seguimos con wger + YouTube para demos.
6. **Superseries v1** (plan-model v2, Fase 1): campo `grupo` en el `plan_json` + helper `groupBySuperset` (`lib/workout.ts`) + render enmarcado en Plan y Ruedo. v1 = display; la ejecución intercalada es v2.
7. **Mesociclos v1** (plan-model v2, Fase 2): tabla `mesocycles` + columnas en `weekly_plans` (migración 003), `lib/mesocycle.ts` (start/advance/regenerate, deload en la última semana), `MesocycleContext` en `generatePlanForUser`, rutas `/api/mesocycle*`, UI de bloque en el Plan. Cada semana se materializa al avanzar con el RPE real de la anterior.

> **Nota de método**: récords y biometría (2 y 3) se construyeron con dos subagentes en paralelo en worktrees aislados (footprints disjuntos), integradas por cherry-pick — patrón a repetir cuando las features no comparten archivos. Superseries y mesociclos (6 y 7) se hicieron secuenciales porque ambas tocan `lib/plan.ts`/el schema del plan (mesociclos apilada sobre superseries para evitar conflictos).

---

## Sesiones anteriores (cronológico)

La primera sesión empezó con un proyecto heredado de otro agente que dejó múltiples bugs críticos. Se resolvieron:

1. **Auditoría profunda** (5 dominios en paralelo: chat, plan, auth, schema, frontend). Hallazgos consolidados y priorizados.
2. **Chat de Kai sin bucle de onboarding**:
   - Buffer SSE correcto en backend (antes se colgaba el chat).
   - Onboarding determinístico en backend (`lib/onboarding.ts: isOnboardingDataComplete`). El LLM no marca el flag; lo hace `updateUserProfile` cuando los 5 datos canónicos están guardados.
   - System prompt condicional (`app/api/chat/route.ts`): si `onboarding_completed` es true, entra en "modo coach" sin instrucciones de recopilar.
   - Se guarda el contenido REAL de la 2ª llamada (no placeholder); antes corrompía el historial y causaba el bucle.
   - `getRecentMessages` ahora trae los 20 más RECIENTES (antes los 20 más antiguos).
   - Tests vitest sobre `isOnboardingDataComplete` (11 casos en verde).
3. **Generación de plan robusta**:
   - Lógica extraída a `lib/plan.ts: generatePlanForUser(userId)`, llamable in-process desde la tool de Kai (antes la tool hacía fetch HTTP a producción sin cookies → 401, nunca generaba).
   - Eliminado `response_format: json_schema`: Bedrock (proveedor de Claude vía OpenRouter) rechaza constraints como `minItems`/`minimum`/`maximum`. Ahora el formato se pide por prompt y se valida con Zod.
   - Reintentos con backoff (3 intentos). `getNextMonday` con timezone local correcta.
   - Validación dura: `wger_id` deben existir en el catálogo pasado al LLM; si inventa uno, reintenta.
4. **Auth y locale**: redirects con locale activo (antes hardcodeaba `/es/`), guard en `disclaimer`, eliminado insert manual redundante (lo cubre el trigger SQL).
5. **UI y limpieza**: banner de onboarding en Dashboard en vez de redirect forzado a Coach, i18n extraído a `messages/`, fuentes via `next/font` sin doble carga, código muerto (`lib/wger.ts` viejo) eliminado.
6. **Migración de ramas**: el repo pasó de `master` a `main` + `develop` siguiendo el flujo de Carlos.
7. **Integración real de wger.de**: (rama `feature/wger-integration`, 2 commits)
   - `lib/supabase/admin.ts` con service_role para escribir `exercises_cache`.
   - `lib/wger.ts` reconstruido: cliente del catálogo, sync, y `getCatalogForUser` (filtra por equipamiento del usuario con mapeo Kinética ↔ wger).
   - `POST /api/admin/sync-exercises` protegido con `SYNC_SECRET` (ejecutar 1 vez para poblar, luego cron).
   - `lib/plan.ts` pasa el catálogo al LLM y valida que ningún `wger_id` se invente.
   - `exercises_cache` ya tiene 846 ejercicios reales en BD.
   - Fix de regenerar: ya no devuelve 409; reemplaza el plan de la semana solo si el nuevo es válido (borra viejo entonces).

---

## ✅ Bug cerrado — "Regenerar no cambiaba el plan"

### Síntoma
En la pestaña Plan, al pulsar "Regenerar" el plan mostrado no cambiaba en nada — ni siquiera los ejercicios concretos al expandir una card.

### Causa raíz (la verdadera, distinta a lo que suponía el handoff anterior)
La petición a OpenRouter en `lib/plan.ts: generateAndValidatePlan` era **byte-idéntica** entre regeneraciones consecutivas: `temperature: 0.5`, mismos `systemPrompt` y `formatInstructions`, **sin nonce ni `seed`**. La "semilla de variación" que las versiones previas de estos docs afirmaban NO existía en el código. Ante una petición idéntica, el proveedor (Claude vía Bedrock) devolvía la **misma completion** → el mismo `plan_json`.

> Lección: el handoff anterior dio por "confirmado correcto" el backend basándose solo en logs server-side de una sesión, y marcó la UI/SW como sospechosos. La instrumentación del **cliente** (que nunca se llegó a ejecutar) era el paso decisivo y apuntó directo al backend.

### Cómo se diagnosticó esta vez
1. Se añadió `cache: 'no-store'` a los fetch del cliente + header `Cache-Control: no-store` a los endpoints (descarta caché de navegador/SW de raíz).
2. Se instrumentó el cliente logueando la huella de `wger_id` recibida en `handleGeneratePlan`.
3. Dos regeneraciones daban la **misma** huella `[539,1219,1467,1296,1919]` pese al `no-store` → el problema no era la red ni el render, sino que el backend devolvía lo mismo.

### Fix aplicado (`lib/plan.ts`)
- Nonce de variación (`variationSeed`) inyectado en el prompt del usuario + pasado como `seed` → cada regeneración manda una petición ÚNICA (rompe caché/determinismo del proveedor).
- `temperature` 0.5 → 0.8.
- Instrucción explícita al modelo de generar un plan distinto al anterior.

Verificado: tras el fix las huellas cambian en cada regeneración y la UI refresca.

### Instrumentación
La instrumentación temporal del cliente ya se revirtió. Los `cache: 'no-store'` se dejaron como mejora defensiva permanente.

---

## Arquitectura — mapa rápido

```
app/
├── api/
│   ├── chat/route.ts          # SSE streaming + tools de Kai
│   ├── plan/
│   │   ├── generate/route.ts  # POST: delega en generatePlanForUser
│   │   └── active/route.ts    # GET: plan activo del usuario
│   ├── workout/
│   │   └── log/route.ts       # POST: persiste el entreno ejecutado (workout_logs, con rpe en sets)
│   ├── progress/records/route.ts # GET: récords + historial por ejercicio
│   ├── biometrics/route.ts    # POST/GET: pesaje manual (biometrics_history)
│   ├── mesocycle/route.ts     # GET (bloque activo) / POST (empezar bloque)
│   ├── mesocycle/week/route.ts # POST { action: advance | regenerate }
│   └── admin/
│       └── sync-exercises/route.ts  # POST protegido con SYNC_SECRET
├── actions/auth.ts             # signUp/signIn/signOut (devuelven redirectTo, no redirect())
└── [locale]/                   # i18n routing (next-intl, localePrefix 'always')
    ├── (auth)/login, register
    ├── (dashboard)/dashboard, plan, coach, ruedo/[dia], progress, biometrics
    └── disclaimer/             # server component con guard

lib/
├── plan.ts                     # ⭐ generación de plan (Zod, retries, catálogo wger, nonce, progresión, MesocycleContext)
├── progression.ts              # ⭐ resumen plan-vs-realidad + señal RPE (puro + wrapper BD). Alimenta plan.ts
├── mesocycle.ts                # ⭐ orquesta bloques: start/advance/regenerate + deload. Llama a generatePlanForUser
├── records.ts                  # récords/historial por ejercicio (e1RM Epley, PRs) — puro + wrapper
├── biometrics.ts               # puro: computeIMC, summarizeWeightTrend
├── biometrics-server.ts        # wrapper BD: getBiometricsHistory
├── wger.ts                     # ⭐ cliente wger + sync + getCatalogForUser
├── youtube.ts                  # cache-first de vídeos (rama feature/exercise-videos)
├── workout.ts                  # tipos + helpers de "En el Ruedo" (SerieRegistro.rpe, RPE_NIVELES, parseReps, groupBySuperset)
├── progress.ts                 # agregación de workout_logs + formatProgressSummary (con tests)
├── tools.ts                    # tools de Kai (update_user_profile, generate_weekly_plan, query_progress_summary, register/resolve_injury)
├── memory.ts                   # 3 capas de memoria (lee biometrics_history/health_metrics → Kai ve pesajes)
├── onboarding.ts               # isOnboardingDataComplete (determinístico)
├── auth.ts                     # requireUser
└── supabase/
    ├── server.ts               # cliente de sesión (anon)
    ├── client.ts               # cliente browser
    └── admin.ts                # ⭐ cliente service_role (escribe exercises_cache)

components/
├── chat/coach-chat.tsx, use-chat-stream.ts, chat-message.tsx, markdown-renderer.tsx
├── plan/weekly-plan-view.tsx   # vista del plan + botón "Entrenar"
├── ruedo/ruedo-view.tsx, exercise-tracker.tsx (con selector RPE), rest-timer.tsx
├── progress/exercise-records.tsx  # récords + evolución por ejercicio (Recharts)
├── biometrics/biometrics-view.tsx, weigh-in-form.tsx, weight-chart.tsx
├── dashboard/dashboard-view.tsx (cards Cuerpo/Récords), dashboard-redline/kinetic, progress-charts.tsx
├── nav/nav-config.ts, sidebar.tsx · bottom-nav.tsx
└── auth/login-form, register-form, user-menu
```

## Comandos útiles

```bash
npm run dev         # dev server (suele subir en :3000 o :3001 si ocupado)
npm run typecheck   # tsc --noEmit
npm run test        # vitest --run
npm run build       # build de producción

# Sincronizar exercises_cache (poblar/refrescar el catálogo de wger):
curl -X POST http://localhost:3001/api/admin/sync-exercises \
     -H "Authorization: Bearer $SYNC_SECRET"

vercel logs kinetica-delta.vercel.app --json   # logs de producción
```

## Schema canónico de `metadata_biometrica`

Ver `docs/kinetica_setup.md` sección 3. Los 5 datos mínimos de onboarding (verificados por `isOnboardingDataComplete`):

- `objetivo_principal` (enum)
- `edad`, `altura_cm`, `peso_inicial_kg` (números)
- `dias_disponibles` (número)
- `equipamiento` (array no vacío, enum de categorías de Kinética)
- `lesiones_activas` (array; puede ser `[]` = preguntado, sin lesiones)

## Mapeo de equipamiento Kinética ↔ wger

En `lib/wger.ts: EQUIPMENT_MAP` y `SIN_FILTRO`. Resumen:

- `peso_corporal_solo` → bodyweight + gym mat
- `bandas_elasticas` → + resistance band
- `mancuernas_basicas` → + dumbbell, kettlebell, bench, incline bench
- `home_gym_completo`, `gimnasio_comercial`, `otro` → sin filtro (todo el catálogo)

---

## Política de cambios y commits

- Flujo: features salen de `develop`; commits importantes a `main` como nuevas versiones.
- Commits con Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- **No hacer commits sin pedirle a Carlos**. Sugerir el mensaje y esperar OK.
- **No hacer push sin permiso explícito**.
- Cambios importantes en arquitectura → confirmar antes de codear.

## Memoria entre sesiones (auto-memory)

Si tienes acceso al auto-memory del usuario (ruta `C:\Users\dealm\.claude\projects\C--00-CARLOS-C-02-CikeTheBear-kinetica\memory\`, índice en `MEMORY.md`), úsalo. Nota clave registrada: **producción despliega de `main`** (no `master`); si no se ven cambios en prod, revisar la Production Branch en Vercel.

Las preferencias críticas de Carlos (onboarding conversacional NO wizard, git workflow main/develop/feature, no commits ni push sin permiso) viven también en `CLAUDE.md`. Si NO tienes acceso a la memoria, todo el contexto crítico está en este archivo, `TODO.md` y `CLAUDE.md`.
