# TODO — Kinética (Estado REAL al 3 Jun 2026)

> Estado real del proyecto al cierre de la sesión con Vertex (Claude). Léelo entero antes de tocar nada — explica qué funciona, qué está roto y por dónde seguir.
> ✅ Funciona · 🐛 Roto · ⏳ No implementado · ⚠️ Parcial / temporalmente desactivado

---

## URL de Producción
**https://kinetica-delta.vercel.app**

## Estado de Git (al cierre)

- Ramas: `main` (principal/versiones, **rama de producción en Vercel**), `develop` (desarrollo), features salen de `develop`.
- **`main` y `develop` están al día y pusheados.** El release `c877c8a` ya está **en producción**: incluye el loop RPE→progresión, récords por ejercicio y biometría manual.
- **Rama abierta sin mergear: `feature/exercise-videos`** — vídeos demostrativos de ejercicios (YouTube, cache-first). Código completo y validado, pero **dormido hasta que se configure `YOUTUBE_API_KEY`** (sin la key el botón "Ver técnica" muestra "no disponible", no rompe). Falta: meter la key en `.env.local` + Vercel, probar y mergear.
- Modelo LLM en uso: `anthropic/claude-haiku-4.5` (env var `OPENROUTER_DEFAULT_MODEL`).

---

## ✅ Lo que FUNCIONA

### Autenticación
- [x] Registro / login / logout con Supabase Auth (email confirmation desactivado v1).
- [x] Redirects con locale activo (es/en), destino post-login unificado a `/dashboard`.
- [x] Guard de sesión en `/disclaimer`. Perfil creado por trigger SQL `handle_new_user`.

### UI base — temas + responsive
- [x] **Sistema de temas** seleccionable en Ajustes: `redline` (default) y `kinetic`, por tokens CSS + `data-theme` (next-themes, sin FOUC). Ver `CLAUDE.md §Design system`.
- [x] **Shell responsive**: `Sidebar` (desktop) + `BottomNav` (móvil) comparten `nav-config.ts`; contenido centrado con `<PageContainer>`.
- [x] **Navegación a 3 ítems**: Inicio · Plan · Coach. Las secciones de seguimiento (Cuerpo y Récords) se enlazan desde **cards del dashboard**, no desde la nav (decisión de IA, 3 Jun).
- [x] i18n (es/en) con next-intl. Fuentes vía `next/font`. PWA instalable (icono SVG placeholder).

### Chat con Kai
- [x] SSE streaming sin cuelgues. Markdown renderer + bloques `kinetica:*`.
- [x] Memoria 3 capas (contexto del usuario + últimos 20 mensajes + resúmenes). `getUserContext` ya lee `biometrics_history` y `health_metrics` → Kai ve los pesajes automáticamente.
- [x] Tools: `update_user_profile`, `generate_weekly_plan` (in-process), `query_progress_summary`, `register_injury`, `resolve_injury`.
- [x] **Onboarding conversacional SIN bucle** — backend determinístico (`isOnboardingDataComplete`) marca `onboarding_completed` solo. System prompt condicional (onboarding vs coach).

### Plan semanal
- [x] Generación vía prompt + Zod (sin `response_format/json_schema`, incompatible con Bedrock). Reintentos con backoff. `getNextMonday` con timezone correcta.
- [x] **Integración real con wger.de**: `exercises_cache` con 846 ejercicios reales; `getCatalogForUser` filtra por equipamiento; el LLM elige SOLO `wger_id` del catálogo (validación dura post-Zod). `POST /api/admin/sync-exercises` (protegido con `SYNC_SECRET`) para repoblar.
- [x] Regenerar reemplaza el plan de la semana (borra el anterior solo si el nuevo es válido). Nonce de variación + `seed` → cada regeneración es única (bug "no cambiaba" cerrado).
- [x] **Progresión de carga por RPE** (regla 7 del prompt): al generar, Kai recibe el resumen de rendimiento de la semana en curso (`lib/progression.ts`) y ajusta cargas ejercicio por ejercicio (sube si sobró margen, mantiene/baja si fue al límite), explicándolo en `notas_kai`. Si no hay datos, parte de pesos normales.

### En el Ruedo (ejecución del entrenamiento)
- [x] Ruta `/[locale]/ruedo/[dia]`. Series pre-rellenadas desde el plan. Steppers grandes +/- de peso y reps. Timer de descanso flotante. Autosave en `localStorage`.
- [x] **Captura de RPE real por serie**: al completar una serie aparece "Esfuerzo: Fácil/Justo/Duro" (→ RPE 6/8/10), opcional, contextual. Se guarda en `workout_logs.sets` (jsonb). Es la señal que alimenta la progresión.
- [x] `POST /api/workout/log` idempotente por día.

### Récords e historial por ejercicio (`/progress`)
- [x] `lib/records.ts` (pura + wrapper): por ejercicio, historial de sesiones y PRs (peso máx, **e1RM Epley** = peso×(1+reps/30), reps máx). Solo series completadas.
- [x] `GET /api/progress/records` + `components/progress/exercise-records.tsx` (lista de PRs + gráfico de evolución por ejercicio, Recharts tematizado). Enlazado desde card del dashboard.

### Biometría — registro manual (`/biometrics`)
- [x] Pesaje manual: peso (obligatorio) + composición opcional (% grasa/músculo/agua/proteína, visceral) → `biometrics_history` con `origen_datos = 'manual'` (upsert por user+fecha+hora+origen).
- [x] IMC calculado en el POST desde `metadata_biometrica.altura_cm` cuando existe.
- [x] `lib/biometrics.ts` (puro: `computeIMC`, `summarizeWeightTrend`) + `lib/biometrics-server.ts` (query) + `app/api/biometrics` (POST/GET) + gráfico de evolución del peso. Enlazado desde card del dashboard.

### Backend / Infra / Tests
- [x] Supabase (`focbdmounzgaujtirvno`) con RLS en todas las tablas.
- [x] **Tests vitest: 58 casos en verde** — onboarding (11), progreso (9), progresión (13), récords (13), biometría (12).
- [x] ESLint + typecheck limpios. Build de producción OK.

---

## ✅ CERRADO — "Regenerar no cambiaba el plan" (resumen)

La petición al LLM era **byte-idéntica** entre regeneraciones (`temperature: 0.5`, sin nonce ni `seed`) → el proveedor (Claude vía Bedrock) devolvía la misma completion. NO era UI ni Service Worker. Fix en `lib/plan.ts`: nonce de variación + `seed` + `temperature` 0.8 + instrucción de variar. Verificado: las huellas de `wger_id` cambian en cada regeneración. (Detalle completo en historial de git.)

---

## 👀 A vigilar (verificar en uso real)

- **Progresión por RPE**: el cerebro de la progresión vive en el LLM (Haiku), guiado por la señal + la regla del prompt — NO en reglas determinísticas. **Hay que comprobar entrenando de verdad que Haiku aplica los ajustes de carga de forma consistente.** Si se despista, el sitio para meter una red de seguridad determinística ya está preparado en `lib/progression.ts` (la señal se calcula aparte del prompt).
- **Features A/B (récords, biometría)**: construidas por subagentes en paralelo, validadas por build/tests pero recién estrenadas en navegador. Revisar en producción.

---

## ⚠️ Parcial / desactivado

- **Vídeos de ejercicios**: code-complete en `feature/exercise-videos`, dormido hasta `YOUTUBE_API_KEY`. Pendiente: key + probar + mergear. (Existe tabla `exercise_video_cache` y `lib/youtube.ts` cache-first; descartado ExerciseDB API por licencia/coste/copyright — ver decisiones.)
- **Service Worker**: solo kill-switch en `public/sw.js`; no hay PWA real (offline/push).
- **Iconos PWA**: SVG placeholder; pendiente PNG definitivo de Carlos (192/512).
- **`scripts/setup-auth-trigger.ts`**: roto (usa service_role key como password de Postgres).

---

## ⏳ NO IMPLEMENTADO (próximos sprints)

**En cola, requieren diseño antes de codear (ambas tocan el schema de `plan_json`):**
- [ ] **Supersets / circuitos**: agrupar ejercicios en "slots" (superseries/biseries) en el plan + UI del Ruedo. La acotada de las dos.
- [ ] **Mesociclos / periodización**: plan de N semanas con arco de progresión + deload, no una semana suelta. El salto grande; el motor de RPE actual sería el engine dentro del bloque. Diseñar con Carlos.

**Resto del backlog:**
- [ ] Tool `modify_current_plan` de Kai (mutar el `plan_json` ejercicio a ejercicio + revalidar `wger_id`; la más delicada).
- [ ] Tool `log_biometric_entry` (que Kai registre pesajes desde el chat — la UI manual ya existe; falta la tool en `lib/tools.ts` + dispatch en chat).
- [ ] **Importación de datos de salud** (Apple Health XML, CSV báscula, PDF) → llena `biometrics_history`/`health_metrics`. El registro manual ya está; falta el parser (complejo: streaming, mapeo HK). Ver PRD §4.
- [ ] Sección de **nutrición** (vía Open Food Facts, como wger) — vertical futuro.
- [ ] Notificaciones push (Web Push) + cron de mensajes proactivos de Kai.
- [ ] Cron en Vercel para resincronizar `exercises_cache`.
- [ ] Observabilidad (Sentry, PostHog). Ampliar tests (1 happy path E2E).
- [ ] Tablas sin uso aún: `proactive_jobs_log`, `push_subscriptions`.

---

## Variables de entorno relevantes

Local (`.env.local`) y/o Vercel:
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only), `OPENROUTER_API_KEY` (server-only)
- `OPENROUTER_DEFAULT_MODEL=anthropic/claude-haiku-4.5`
- `SYNC_SECRET` (server-only)
- `YOUTUBE_API_KEY` (server-only) — **pendiente**, desbloquea los vídeos de ejercicios.

---

## Decisiones técnicas clave (acumulado)

1. **No usar `response_format: json_schema`** en generación de plan (Bedrock rechaza `minItems`/`minimum`/`maximum`). JSON por prompt + Zod.
2. **Onboarding determinístico en backend**, no en el LLM.
3. **Catálogo wger pre-sincronizado**; el LLM solo elige IDs reales filtrados por equipamiento.
4. **Cliente admin (service_role)** para escribir tablas globales con RLS restrictiva (`exercises_cache`).
5. **Regenerar reemplaza** el plan generando el nuevo primero y borrando el viejo solo si es válido.
6. **Progresión: el cerebro en el LLM**, no reglas rígidas. `lib/progression.ts` resume plan-vs-realidad (con RPE real) y el prompt instruye a Kai a progresar. Red de seguridad determinística posible si hace falta.
7. **Catálogo de ejercicios: wger, no ExerciseDB.** ExerciseDB es API de pago (RapidAPI), sin self-host, sin licencia de su media declarada (riesgo copyright). El hueco de "demo visual" lo cubre el embed de YouTube (legalmente limpio).
8. **Nav a 3 + cards de seguimiento**: la nav principal se reserva a destinaciones de uso diario (Inicio/Plan/Coach); Cuerpo y Récords cuelgan del dashboard.

---

## Contacto
Carlos. Cualquier ambigüedad de arquitectura o flujo → consultar con él.
