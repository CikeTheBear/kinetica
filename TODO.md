# TODO — Kinética (Estado REAL al 28 May 2026)

> Estado real del proyecto al cierre de la sesión con Vertex (Claude). Léelo entero antes de tocar nada — explica qué funciona, qué está roto y por dónde seguir.
> ✅ Funciona · 🐛 Roto · ⏳ No implementado · ⚠️ Parcial / temporalmente desactivado

---

## URL de Producción
**https://kinetica-delta.vercel.app**

## Estado de Git (al cierre)

- Ramas: `main` (principal/versiones), `develop` (desarrollo), features salen de `develop`.
- Rama actual de trabajo: **`feature/wger-integration`** — tiene 2 commits sobre `develop` pendientes de validar y mergear (la integración de wger y el fix del 409 de regenerar). NO mergear todavía: hay un bug activo en la UI de regeneración (ver abajo).
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

### Backend / Infra
- [x] Supabase (`focbdmounzgaujtirvno`) con RLS en todas las tablas.
- [x] Tests vitest: 11 casos sobre `isOnboardingDataComplete` en verde.
- [x] Typecheck limpio.

---

## 🐛 BUG ACTIVO — La UI no refresca el plan tras regenerar

**Síntoma:** Al darle al botón "Regenerar" en la pestaña Plan, el botón pasa por el estado de carga (~20s) y vuelve a activo, pero el plan que se ve no cambia en nada visualmente.

**Diagnóstico hecho en esta sesión (verificable en código):**

1. **El backend SÍ genera planes nuevos y distintos cada vez.** Confirmado con instrumentación temporal: dos regeneraciones consecutivas produjeron `wger_id` distintos por día (`lun:[1277,1198,...]` vs `lun:[539,1219,...]`).
2. **El LLM produce variedad real** con `temperature: 0.8` + semilla de variación + instrucción explícita de "no repitas exactamente un plan anterior".
3. **El plan nuevo se persiste correctamente** en `weekly_plans` (el endpoint devuelve 200 y el insert ocurre — `lib/plan.ts` borra el plan de esa semana y guarda el nuevo).
4. **El código de `handleGeneratePlan` en `components/plan/weekly-plan-view.tsx` parece correcto a inspección**: hace `setPlan(data.plan)` con la respuesta del POST, y `data.plan` es la fila completa de `weekly_plans` con `plan_json` actualizado.

**Por dónde NO está el problema (descartado):**
- Generación del plan.
- Validación Zod / del catálogo wger.
- Persistencia en BD.
- Shape de la respuesta del endpoint.

**Hipótesis pendientes de verificar (en este orden):**
1. **Caché del navegador o Service Worker antiguo.** El `public/sw.js` actual es un kill-switch benigno (no intercepta fetches), pero un SW de versiones anteriores del proyecto pudo haber cacheado respuestas y seguir interfiriendo. → **Acción**: hard refresh (Ctrl+F5) + DevTools → Application → Service Workers → Unregister + Clear site data + reintentar.
2. **Si tras hard refresh persiste**, instrumentar el cliente (añadir un `console.log(data)` justo antes del `setPlan` en `handleGeneratePlan`) y ver en DevTools Console si los datos que llegan al cliente sí varían entre regeneraciones. Si llegan distintos pero el render es igual, hay un bug sutil de React (memo/key/referencia). Si llegan iguales pese a que el backend genera distinto, hay caché HTTP/SW.

**Archivos clave a tocar para cerrar el bug:**
- `components/plan/weekly-plan-view.tsx` (UI, `handleGeneratePlan`)
- `public/sw.js` y `components/service-worker-register.tsx` (Service Worker)
- `app/api/plan/active/route.ts` (no cachea, pero verificar)
- `lib/plan.ts` (backend; ya verificado que funciona — no tocar para arreglar este bug)

---

## ⚠️ Parcial / desactivado

- **Service Worker**: solo kill-switch en `public/sw.js`; no hay PWA real (offline, push). Probable culpable del bug activo si hay SWs antiguos residuales.
- **Disclaimer**: tiene guard de auth pero falta re-engancharlo en el flujo (idealmente modal, no redirect).
- **Iconos PWA**: SVG placeholder funcional; pendiente diseño PNG definitivo de Carlos (192×192 y 512×512, opcional maskable).
- **`scripts/setup-auth-trigger.ts`**: documentado como roto (usa service_role key como password de Postgres, que no lo es).

---

## ⏳ NO IMPLEMENTADO (próximos sprints)

### Cuando se cierre el bug de UI y se mergee `feature/wger-integration` → `develop`:

**Siguiente feature recomendada: "En el Ruedo" (modo de ejecución del entrenamiento).**
- Vista del día actual con los ejercicios (ya tienen `wger_id` reales tras la integración wger).
- Inputs grandes +/- para peso y reps.
- Botón "completar serie" → temporizador de descanso flotante.
- Persistir en `workout_logs`.

### Resto del backlog
- [ ] Gráficas de progreso en Dashboard.
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
