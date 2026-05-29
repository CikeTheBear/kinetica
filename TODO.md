# TODO — Kinética (Estado REAL al 29 May 2026)

> Estado real del proyecto al cierre de la sesión con Vertex (Claude). Léelo entero antes de tocar nada — explica qué funciona, qué está roto y por dónde seguir.
> ✅ Funciona · 🐛 Roto · ⏳ No implementado · ⚠️ Parcial / temporalmente desactivado

---

## URL de Producción
**https://kinetica-delta.vercel.app**

## Estado de Git (al cierre)

- Ramas: `main` (principal/versiones), `develop` (desarrollo), features salen de `develop`.
- `feature/wger-integration` ya está **mergeada en `develop`** (integración wger + fix del 409 + fix de "regenerar no cambiaba el plan", ya pusheado a origin).
- Rama actual de trabajo: **`feature/en-el-ruedo`** — modo de ejecución del entrenamiento, ya implementado y validado (1 commit). Pendiente: mergear a `develop`. Hay además un commit `chore` de config de ESLint en `develop` sin pushear.
- Modelo LLM en uso: `anthropic/claude-haiku-4.5` (env var `OPENROUTER_DEFAULT_MODEL`).

---

## ✅ Lo que FUNCIONA

### Autenticación
- [x] Registro / login / logout con Supabase Auth (email confirmation desactivado v1).
- [x] Redirects con locale activo (es/en), destino post-login unificado a `/dashboard`.
- [x] Guard de sesión en `/disclaimer`.
- [x] Perfil creado por trigger SQL `handle_new_user`, sin insert manual duplicado.

### UI base
- [x] Bottom nav (Dashboard, Plan, Coach), dark mode first.
- [x] i18n (es/en) con next-intl — todos los textos relevantes extraídos a `messages/`.
- [x] Banner de invitación al onboarding en el Dashboard si onboarding incompleto (no fuerza redirect a Coach).
- [x] Fuentes vía `next/font` (sin doble carga), zoom permitido (a11y).
- [x] PWA instalable con icono SVG placeholder (Carlos: pendiente PNGs definitivos 192/512).

### Chat con Kai
- [x] SSE streaming sin cuelgues (buffer correcto en backend).
- [x] Markdown renderer + bloques especiales `kinetica:*`.
- [x] Memoria 3 capas (contexto del usuario + últimos 20 mensajes + resúmenes).
- [x] Tool `update_user_profile` (escribe `metadata_biometrica` con campos canónicos).
- [x] Tool `generate_weekly_plan` (llama in-process a `generatePlanForUser`).
- [x] **Onboarding conversacional SIN bucle** — el backend detecta los 5 datos canónicos vía `isOnboardingDataComplete` y marca `onboarding_completed` solo, sin depender del LLM.
- [x] System prompt condicional (modo onboarding vs modo coach).

### Plan semanal
- [x] Generación vía prompt + Zod (sin `response_format/json_schema`, que rompía con Bedrock).
- [x] Reintentos con backoff (3 intentos). Tolera días de descanso (duración 0).
- [x] `getNextMonday` con timezone correcta.
- [x] **Integración real con wger.de**:
  - `lib/wger.ts`: cliente del catálogo (`/exerciseinfo/`, traducciones es/en, equipamiento, imagen).
  - `lib/supabase/admin.ts`: cliente service_role para poder escribir en `exercises_cache` (su RLS bloquea el cliente normal).
  - `exercises_cache` poblado con 846 ejercicios reales (sync ejecutado al menos una vez en esta sesión).
  - Endpoint `POST /api/admin/sync-exercises` protegido con `SYNC_SECRET` para refrescar el catálogo a demanda.
  - `getCatalogForUser` filtra el catálogo por el equipamiento del usuario (mapeo Kinética ↔ wger).
  - El LLM elige SOLO de los `wger_id` del catálogo que se le pasa; validación dura post-Zod (si inventa un ID, reintenta).
- [x] Regenerar plan reemplaza el de la semana (borra el anterior solo si el nuevo es válido; antes devolvía 409).

### En el Ruedo (modo de ejecución del entrenamiento)
- [x] Ruta `/[locale]/ruedo/[dia]` (server component: auth, carga plan activo, valida día, redirige a `/plan` si no aplica).
- [x] Series pre-rellenadas desde los objetivos del plan (peso sugerido + reps objetivo parseadas).
- [x] Steppers grandes +/- de peso (paso 2.5 kg) y reps; marcar serie completada.
- [x] Timer de descanso flotante al completar serie (pausar, +15s, saltar, vibración al terminar).
- [x] Autosave en `localStorage` (borrador por plan+día, con firma de ejercicios para invalidar si se regenera el plan).
- [x] `POST /api/workout/log` con validación Zod, idempotente por día → escribe en `workout_logs` (una fila por ejercicio, series en `jsonb`).
- [x] Botón "Entrenar" por día de entreno en la pestaña Plan. i18n es/en.

### Backend / Infra
- [x] Supabase (`focbdmounzgaujtirvno`) con RLS en todas las tablas.
- [x] Tests vitest: 11 casos sobre `isOnboardingDataComplete` en verde.
- [x] Typecheck limpio.

---

## ✅ CERRADO — "Regenerar no cambiaba el plan"

**Síntoma original:** al pulsar "Regenerar" en la pestaña Plan, el plan mostrado no cambiaba en nada (ni siquiera los ejercicios al expandir una card).

**Causa raíz (verificada, NO era lo que decía el handoff anterior):** la petición al LLM era **byte-idéntica** entre regeneraciones consecutivas — `temperature: 0.5`, sin nonce de variación ni `seed` (el código real NO tenía la "semilla de variación" que los docs afirmaban). El proveedor (Claude vía Bedrock/OpenRouter) devolvía la **misma completion** ante una petición idéntica → el mismo `plan_json`. No era ni la UI, ni el render de React, ni un Service Worker.

**Cómo se diagnosticó:** se instrumentó el **cliente** (paso que el handoff anterior nunca ejecutó) logueando la huella de `wger_id` recibida. Dos regeneraciones daban la huella idéntica `[539,1219,1467,1296,1919]` pese a `cache: 'no-store'` → descartaba caché de navegador/SW y señalaba al backend.

**Fix (`lib/plan.ts`, `generateAndValidatePlan`):**
- Nonce de variación inyectado en el prompt del usuario + pasado como `seed` → cada regeneración manda una petición ÚNICA.
- `temperature` subida de 0.5 a 0.8.
- Instrucción explícita de "genera un plan distinto al anterior".

Tras el fix, las huellas cambian en cada regeneración (ej. `[1094,1084,1228,1779,1194,1919]` vs `[1119,1082,1471,1307,1572,1921]`) y la UI refresca correctamente.

**Mejora defensiva añadida de paso:** `cache: 'no-store'` en los `fetch` del cliente y header `Cache-Control: no-store` en `/api/plan/generate` y `/api/plan/active`.

---

## ⚠️ Parcial / desactivado

- **Service Worker**: solo kill-switch en `public/sw.js`; no hay PWA real (offline, push). Probable culpable del bug activo si hay SWs antiguos residuales.
- **Disclaimer**: tiene guard de auth pero falta re-engancharlo en el flujo (idealmente modal, no redirect).
- **Iconos PWA**: SVG placeholder funcional; pendiente diseño PNG definitivo de Carlos (192×192 y 512×512, opcional maskable).
- **`scripts/setup-auth-trigger.ts`**: documentado como roto (usa service_role key como password de Postgres, que no lo es).

---

## ⏳ NO IMPLEMENTADO (próximos sprints)

**Siguiente feature recomendada: gráficas de progreso en Dashboard.** Ahora "En el Ruedo" ya escribe en `workout_logs`, así que por fin hay datos reales que graficar (peso/volumen por ejercicio, series completadas, etc.).

### Resto del backlog
- [ ] Gráficas de progreso en Dashboard (desbloqueado por los datos de `workout_logs`).
- [ ] Mejoras a "En el Ruedo" v2: guardado incremental por serie (no solo al finalizar), modo immersive sin bottom nav, notas por ejercicio, historial de entrenos pasados.
- [ ] Importación de datos de salud (Apple Health XML, CSV báscula, PDF).
- [ ] Videos de ejercicios (YouTube Data API v3) — ahora factible con `wger_id` reales.
- [ ] Notificaciones push (Web Push) + cron de mensajes proactivos de Kai.
- [ ] Tools de Kai: `modify_current_plan`, `register_injury`, `resolve_injury`, `log_biometric_entry`, `log_health_metric`, `query_progress_summary`.
- [ ] Observabilidad: Sentry, PostHog.
- [ ] Cron en Vercel para resincronizar `exercises_cache` periódicamente.
- [ ] Ampliar tests (parser de salud, validadores, tools que mutan datos, 1 happy path E2E).
- [ ] Tablas de schema sin uso aún: `proactive_jobs_log`, `push_subscriptions`.

---

## Variables de entorno relevantes

Local (`.env.local`) y/o Vercel:
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `OPENROUTER_API_KEY` (server-only)
- `OPENROUTER_DEFAULT_MODEL=anthropic/claude-haiku-4.5`
- `SYNC_SECRET` (server-only, para `/api/admin/sync-exercises`)

---

## Decisiones técnicas clave de esta sesión

1. **No usar `response_format: json_schema`** del proveedor en la generación de plan. Bedrock (que sirve Claude vía OpenRouter) rechaza constraints como `minItems`/`minimum`/`maximum`. Se pide el JSON por prompt y se valida con Zod. Esto desacopla del proveedor.
2. **Onboarding determinístico en backend, no en el LLM.** `isOnboardingDataComplete` decide cuándo está completo, y `updateUserProfile` marca el flag automáticamente. El system prompt es condicional (modo onboarding vs coach).
3. **Catálogo de ejercicios pre-sincronizado, no enriquecimiento post-generación.** El LLM elige `wger_id` de la lista real de wger filtrada por el equipamiento del usuario → imposible inventar ejercicios.
4. **Cliente admin Supabase con service_role** para escribir en `exercises_cache` (su RLS bloquea el cliente de sesión).
5. **Regenerar reemplaza el plan de la semana**, generando el nuevo PRIMERO y borrando el viejo solo si el nuevo es válido (no dejar al usuario sin plan ante un fallo).

---

## Contacto
Carlos. Cualquier ambigüedad de arquitectura o flujo → consultar con él.
