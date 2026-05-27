# TODO — Kinética (Estado REAL al 27 May 2026)

> Estado real del proyecto. Actualizado tras la sesión que resolvió los bugs críticos del chat y del generador de plan.
> ✅ = Funciona | 🐛 = Roto / Bug conocido | ⏳ = No implementado | ⚠️ = Temporalmente desactivado

---

## URL de Producción
**https://kinetica-delta.vercel.app**

Ramas: `main` (principal/versiones) · `develop` (desarrollo) · features salen de `develop`.

---

## ✅ Lo que FUNCIONA

### Autenticación
- [x] Registro / login / logout con Supabase Auth
- [x] Email confirmation desactivado (testing v1)
- [x] Redirects con locale activo (es/en), destino post-login unificado a `/dashboard`
- [x] Guard de sesión en `/disclaimer`
- [x] Perfil creado por trigger SQL (`handle_new_user`), sin insert manual duplicado

### Navegación y UI Base
- [x] Bottom nav con 3 tabs: Dashboard, Plan, Coach
- [x] Dark mode first
- [x] i18n (es/en) con next-intl — textos extraídos a `messages/`
- [x] Fuentes vía `next/font` (sin doble carga), zoom permitido (a11y)

### Chat con Kai
- [x] SSE streaming con buffer correcto en backend (ya no se cuelga)
- [x] Markdown renderer + bloques especiales `kinetica:*`
- [x] Memoria 3 capas (contexto BD + mensajes recientes + resúmenes)
- [x] Tool `update_user_profile` (escribe `metadata_biometrica`)
- [x] Tool `generate_weekly_plan` (llama la generación in-process)
- [x] **Onboarding conversacional SIN bucle** — el backend detecta los 5 datos y marca `onboarding_completed` de forma determinística (`isOnboardingDataComplete`), sin depender del LLM
- [x] System prompt condicional (modo onboarding vs modo coach)

### Plan Semanal
- [x] Generación robusta vía prompt + validación Zod (sin `json_schema` frágil)
- [x] Reintentos con backoff; tolera días de descanso (duración 0)
- [x] `getNextMonday` con timezone correcta
- [x] Renderizado del plan en UI (vista semanal)

### Backend / Infra
- [x] Supabase (`focbdmounzgaujtirvno`) con RLS en todas las tablas
- [x] Vercel deploy automatizado
- [x] Modelo LLM: `anthropic/claude-haiku-4.5` (fiable en tool calling)
- [x] Tests de `isOnboardingDataComplete` (vitest)

---

## 🐛 BUGS CRÍTICOS — RESUELTOS

1. ~~Bucle de onboarding~~ → onboarding determinístico en backend + system prompt condicional.
2. ~~Chat se cuelga (SSE)~~ → buffer entre lecturas en el backend.
3. ~~Plan no se generaba~~ → la tool llama la lógica in-process (sin self-call HTTP/401); generación vía prompt+Zod (el proveedor Bedrock rechazaba `json_schema` con constraints).

---

## ⚠️ Temporalmente Desactivado / Parcial
- **Service Worker** — solo kill-switch en `public/sw.js`, sin PWA real (offline/push).
- **Disclaimer** — tiene guard de auth, pero falta re-engancharlo en el flujo (idealmente como modal, no redirect).

---

## ⏳ NO IMPLEMENTADO (próximos sprints)

### Fundamento de datos
- [ ] **Integración real de wger.de** — ahora el LLM inventa `wger_id` sin validar (prerequisito de imágenes/videos). El cliente `wger.ts` se borró (estaba muerto); reconstruir conectado al plan.

### Core features
- [ ] Registro de entrenamientos ("En el Ruedo") + timer de descanso (`workout_logs`)
- [ ] Gráficas de progreso en Dashboard
- [ ] Importación de datos de salud (Apple Health XML, CSV báscula, PDF)
- [ ] Videos de ejercicios (YouTube Data API v3 — depende de `wger_id` reales)
- [ ] Notificaciones push (Web Push) + cron de mensajes proactivos de Kai

### Tools de Kai (faltan)
- [ ] `modify_current_plan`, `register_injury`, `resolve_injury`, `log_biometric_entry`, `log_health_metric`, `query_progress_summary`

### Observabilidad / Assets / Testing
- [ ] Sentry, PostHog
- [ ] Iconos PWA definitivos (placeholder SVG temporal en su lugar) + splash screens iOS
- [ ] `scripts/setup-auth-trigger.ts` necesita la DB password real (no el service_role key)
- [ ] Ampliar tests (parser de salud, validadores, tools que mutan datos, 1 happy path E2E)

---

## Modelo LLM
`anthropic/claude-haiku-4.5` (configurado en `.env.local` y Vercel). Fallback en código también a Haiku. La generación de plan NO depende de structured outputs del proveedor — pide JSON por prompt y valida con Zod, así que cambiar de modelo no rompe el plan.

---

## Contacto
Carlos. Cualquier duda de arquitectura o flujo → consultar con él.
