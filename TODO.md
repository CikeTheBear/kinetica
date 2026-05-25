# TODO — Kinética (Tareas para Carlos)

> Este documento contiene todas las tareas operativas que **requieren acción manual** de tu parte.
> ✅ = Ya completado | ⏳ = Pendiente | 🔄 = En progreso

---

## ✅ Fase 1 — Infraestructura base (COMPLETADA)

### Supabase
- [x] Crear proyecto en [supabase.com](https://supabase.com).
- [x] Ejecutar migration `001_initial_schema.sql` en SQL Editor.
- [x] Verificar tablas en Table Editor.
- [x] Desactivar email confirmation (Auth → Providers → Email → Confirm email = false).
- [x] Probar registro/login localmente — funciona correctamente.

### Variables de entorno locales
- [x] Crear `.env.local` con Supabase URL, Anon Key, Service Role Key.
- [x] Agregar OpenRouter API key.
- [x] Verificar `.env.local` en `.gitignore`.

---

## ⏳ Fase 2 — Deploy en Vercel (SIGUIENTE PASO)

### GitHub
- [ ] Crear repo en GitHub y hacer push del código.
- [ ] Verificar que no se subió `.env.local`.

### Vercel
- [ ] Crear proyecto en [vercel.com](https://vercel.com) conectado al repo de GitHub.
- [ ] En Settings → Environment Variables, agregar:
  ```
  NEXT_PUBLIC_APP_URL=https://kinetica.app (o tu dominio)
  NEXT_PUBLIC_SUPABASE_URL=https://focbdmounzgaujtirvno.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
  NEXT_PUBLIC_DEFAULT_LOCALE=es
  OPENROUTER_API_KEY=sk-or-v1-...
  OPENROUTER_DEFAULT_MODEL=google/gemini-3-flash-preview
  OPENROUTER_FALLBACK_MODEL=openai/gpt-4o
  ```
- [ ] Deployar y probar registro → login → Coach en la URL de Vercel.

---

## ⏳ Fase 3 — APIs y servicios externos (bloqueantes para Sprint 3+)

### YouTube Data API v3
- [ ] Ir a [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Enable API → YouTube Data API v3.
- [ ] Crear API key restringida (por IP / referer).
- [ ] Agregar `YOUTUBE_API_KEY=AIza...` a Vercel env vars.

---

## ⏳ Fase 4 — PWA y notificaciones (Sprint 6, prep de keys)

### Web Push VAPID keys
- [ ] Ejecutar: `npx web-push generate-vapid-keys`
- [ ] Guardar `publicKey` y `privateKey`.
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → Vercel (pública).
- [ ] `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT=mailto:tu@email.com` → Vercel (privada).

---

## ⏳ Fase 5 — Assets e iconografía

- [ ] Crear o solicitar íconos PWA:
  - `public/icon-192x192.png`
  - `public/icon-512x512.png`
- [ ] (Opcional) Splash screens para iOS.

---

## ⏳ Fase 6 — Observabilidad (opcional para v1)

### Sentry
- [ ] Crear proyecto en [sentry.io](https://sentry.io).
- [ ] Agregar `SENTRY_DSN` y `SENTRY_AUTH_TOKEN` a Vercel.

### PostHog
- [ ] Crear cuenta en [posthog.com](https://posthog.com) (EU region).
- [ ] Agregar `NEXT_PUBLIC_POSTHOG_KEY` a Vercel.

---

## Estado actual del proyecto

| Componente | Estado |
|---|---|
| Registro/Login con Supabase Auth | ✅ Funciona |
| Chat con Kai (SSE streaming) | ✅ Funciona |
| Onboarding conversacional | ✅ Funciona (Kai pide datos) |
| Markdown renderer | ✅ Funciona (negritas, listas, tablas, etc.) |
| Bloques especiales de Kai (plan-card, alert, chart) | ✅ Parseados |
| Memoria Capa 1 (contexto usuario) | ✅ Implementada |
| Memoria Capa 2 (últimos 20 mensajes) | ✅ Implementada |
| Tool `update_user_profile` | ✅ Implementada |
| Deploy en producción (Vercel) | ⏳ Pendiente |
| Integración con wger.de (ejercicios) | ⏳ Sprint 3 |
| Generación de planes semanales | ⏳ Sprint 3 |
| Web Push notifications | ⏳ Sprint 6 |

---

## Contacto / soporte

Si algo de esta lista no tiene sentido o necesitas ayuda con algún paso, pregunta en el chat.
