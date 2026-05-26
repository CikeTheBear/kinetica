# TODO — Kinética (Estado REAL al 26 May 2026)

> Este documento contiene el estado REAL del proyecto. Fue actualizado después de múltiples intentos de arreglar el chat de Kai.
> ✅ = Funciona | 🐛 = Roto / Bug conocido | ⏳ = No implementado | ⚠️ = Temporalmente desactivado

---

## URL de Producción
**https://kinetica-delta.vercel.app**

Último deploy: 26 May 2026

---

## ✅ Lo que FUNCIONA

### Autenticación
- [x] Registro con email/password (Supabase Auth)
- [x] Login con email/password
- [x] Logout
- [x] Email confirmation **desactivado** (para testing v1)
- [x] Funciona en local y producción

### Navegación y UI Base
- [x] Bottom nav con 3 tabs: Dashboard, Plan, Coach
- [x] Dark mode first implementado (Tailwind config completo)
- [x] i18n básico (es/en) con next-intl
- [x] Layout del dashboard con tabs funcionando

### Chat con Kai — FUNCIONA PARCIALMENTE (ver bugs abajo)
- [x] SSE streaming implementado (backend + frontend)
- [x] Markdown renderer (negritas, listas, tablas)
- [x] Multiline textarea con Enter-to-send
- [x] Memoria Capa 1 (contexto del usuario desde BD)
- [x] Memoria Capa 2 (últimos 20 mensajes de chat)
- [x] Memoria Capa 3 (resúmenes de conversaciones previas)
- [x] Tool `update_user_profile` — actualiza `metadata_biometrica`
- [x] Tool `mark_onboarding_complete` — marca onboarding como completado
- [x] Tool `generate_weekly_plan` — genera plan vía endpoint
- [x] **Onboarding conversacional** — Kai pide datos y los guarda
- [x] Tool calling con segunda llamada al LLM (refactor reciente)

### Plan Semanal
- [x] Endpoint `/api/plan/generate` con OpenRouter structured outputs
- [x] Validación Zod del plan generado
- [x] Renderizado básico del plan en UI (vista semanal)

### Backend / Infra
- [x] Supabase conectado (proyecto: `focbdmounzgaujtirvno`)
- [x] Schema inicial creado (`user_profiles`, `chat_messages`, `biometrics_history`, `weekly_plans`, etc.)
- [x] RLS habilitado en tablas
- [x] Vercel deploy automatizado desde GitHub

---

## 🐛 BUGS CONOCIDOS (prioridad alta)

### 1. Chat de Kai entra en bucle de onboarding [CRÍTICO]
**Síntoma:** Cuando el usuario confirma sus datos, Kai repite las preguntas de onboarding en vez de marcarlo como completado y generar el plan.

**Causa raíz:** A pesar de tener:
- Tool `mark_onboarding_complete` implementada
- Reglas en system prompt que le dicen a Kai qué hacer
- Tool calling con segunda llamada al LLM

...el modelo (google/gemini-3-flash-preview) **no respeta consistentemente** las instrucciones del system prompt para llamar tools. A veces llama la tool, a veces no, a veces simula que la llamó sin hacerlo.

**Historial de intentos:**
- Intento 1: Añadir reglas en system prompt → No funcionó
- Intento 2: Crear tool `mark_onboarding_complete` → Tool creada pero modelo no la llama
- Intento 3: Refactor tool calling con segunda llamada al LLM → Parcial, sigue sin ser confiable

**Posibles soluciones:**
1. **Cambiar a modelo más obediente** (Claude 3.5 Sonnet, GPT-4o) que respete tool calling
2. **No depender del LLM para lógica de estado** — Hacer el onboarding en pasos estructurados (formulario wizard) y que Kai solo confirme
3. **Hardcodear el flujo** — Detectar en el backend cuándo tenemos los 5 datos y forzar `mark_onboarding_complete` sin depender del LLM

### 2. Chat se queda en "escribiendo" sin responder [CRÍTICO]
**Síntoma:** Después de unos mensajes, Kai deja de responder. El indicador de "escribiendo" aparece pero no llega contenido.

**Causa raíz:** SSE streaming puede romperse cuando:
- OpenRouter envía chunks fragmentados que no se parsean bien
- La tool calling interrumpe el stream y no se recupera
- El `abortController` no se limpia correctamente entre mensajes

**Intentos:**
- Añadido buffer de líneas en el frontend
- Añadido manejo de errores en el stream
- Refactor de tool calling con segunda llamada

**Estado:** Parcialmente arreglado pero no 100% confiable.

### 3. Service Worker antiguo causa problemas de caché
**Síntoma:** Deploys nuevos no se reflejan inmediatamente en el navegador.

**Workaround actual:** Kill-switch SW en `public/sw.js` que desregistra SWs antiguos.

**Solución definitiva:** Implementar Service Worker correcto con estrategia de caché apropiada.

---

## ⚠️ Temporalmente Desactivado

- **Disclaimer médico** — Implementado en `/disclaimer` pero desactivado en layout para evitar loops de redirect
- **Service Worker** — Solo kill-switch, no hay funcionalidad PWA real (offline, push)
- **Onboarding redirect** — Checks de `onboarding_completed` y `disclaimer_accepted_at` removidos del dashboard layout para evitar loops

---

## ⏳ NO IMPLEMENTADO (pendiente de sprints futuros)

### Core features
- [ ] Registro de entrenamientos ("En el Ruedo")
- [ ] Timer de descanso entre series
- [ ] Importación de datos de salud (Apple Health XML, CSV, PDF báscula)
- [ ] Gráficas de progreso en Dashboard
- [ ] Videos de ejercicios (YouTube Data API v3)
- [ ] Notificaciones push (Web Push)
- [ ] Cron jobs para mensajes proactivos de Kai

### APIs externas
- [ ] YouTube Data API v3 key
- [ ] wger.de integración real (solo está el cliente, no se consume en el plan)

### Tools de Kai (faltan)
- [ ] `register_injury`
- [ ] `resolve_injury`
- [ ] `modify_current_plan`
- [ ] `log_biometric_entry`
- [ ] `log_health_metric`
- [ ] `query_progress_summary`

### Observabilidad
- [ ] Sentry
- [ ] PostHog

### Assets
- [ ] Iconos PWA (192x192, 512x512)
- [ ] Splash screens iOS

### Testing
- [ ] Ningún test escrito todavía

---

## Variables de Entorno Actuales (Vercel)

Las siguientes están configuradas en Vercel:
- `NEXT_PUBLIC_APP_URL=https://kinetica-delta.vercel.app`
- `NEXT_PUBLIC_SUPABASE_URL=https://focbdmounzgaujtirvno.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<public>`
- `OPENROUTER_API_KEY=<set>`
- `OPENROUTER_DEFAULT_MODEL=google/gemini-3-flash-preview` ⚠️ **Modelo actual, ver nota abajo**
- `SUPABASE_SERVICE_ROLE_KEY=<set>`

**Nota sobre el modelo:** Actualmente usa `google/gemini-3-flash-preview` que es económico pero **no respeta bien tool calling ni system prompts complejos**. Se recomienda cambiar a `anthropic/claude-3.5-sonnet` o `openai/gpt-4o` para mejor confiabilidad.

---

## Stack Tecnológico Actual

| Capa | Tecnología | Estado |
|---|---|---|
| Framework | Next.js 14.2.3 + App Router | ✅ |
| Lenguaje | TypeScript | ✅ |
| Estilos | Tailwind CSS + shadcn/ui | ✅ |
| Backend / DB / Auth | Supabase | ✅ |
| LLM | OpenRouter | ✅ (pero modelo problemático) |
| Hosting | Vercel | ✅ |
| i18n | next-intl | ✅ |
| Iconos | lucide-react | ✅ |

---

## Decisiones Técnicas Tomadas

1. **Modelo LLM actual:** `google/gemini-3-flash-preview` — económico pero problemático con tool calling. Considerar cambio.
2. **Tool calling:** Implementado con doble llamada (primera para tools, segunda para respuesta). Funciona pero es frágil con el modelo actual.
3. **Service Worker:** Kill-switch temporal. No hay offline support todavía.
4. **Onboarding:** Flujo conversacional puramente por chat. Esto ha demostrado ser poco confiable. Considerar wizard estructurado.
5. **Redirects:** Eliminados checks de onboarding/disclaimer del layout para evitar loops. Se necesita re-implementar de forma segura.

---

## Próximos Pasos Recomendados

**Opción A — Arreglar chat primero:**
1. Cambiar modelo a Claude 3.5 Sonnet o GPT-4o
2. Simplificar el system prompt de Kai (menos reglas, más directo)
3. Implementar hardcoded onboarding detection en backend
4. Re-habilitar disclaimer con modal en vez de redirect

**Opción B — Pivotar a wizard estructurado:**
1. Crear wizard de onboarding con pasos estructurados (formularios)
2. Kai solo confirma datos al final, no guía el flujo
3. Más predecible, menos dependencia del LLM

**Opción C — Mixto:**
1. Wizard estructurado para recopilar datos
2. Kai como "coach" que comenta y ajusta, no como guía del flujo

---

## Contacto
Carlos. Cualquier duda, ambigüedad o decisión de arquitectura → consultar con él.
