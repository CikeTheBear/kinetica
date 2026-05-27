# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Antes de tocar nada — orden de lectura obligatorio

Esta documentación se contradice entre sí en partes. **`TODO.md` es la fuente de verdad** (estado más reciente y real). El resto sigue después:

1. `TODO.md` — Estado REAL: qué funciona, qué está roto, qué falta.
2. `docs/ESTADO_ACTUAL.md` — Handoff técnico detallado con flujos y arquitectura de bugs.
3. `docs/kinetica_prd.md` — Visión, schema de Supabase, sprints.
4. `docs/kai_identity.md` — Personalidad, system prompt, límites de Kai (el agente).
5. `docs/kinetica_setup.md` — Variables de entorno, schemas, i18n, design system.
6. `AGENTS.md` — Resumen del estado para agentes IA (puede estar desfasado respecto a `TODO.md`).

Producción: **https://kinetica-delta.vercel.app** — Supabase project: `focbdmounzgaujtirvno`.

## Comandos

```bash
npm run dev         # Next dev server
npm run build       # Build de producción
npm run start       # Servir build
npm run lint        # ESLint (next lint)
npm run typecheck   # tsc --noEmit
npm run test        # vitest (run único)
npm run test:e2e    # playwright

vercel --prod                                  # Deploy manual
vercel logs kinetica-delta.vercel.app --json   # Logs producción
```

No hay tests escritos todavía. `tests/` está vacío.

## Stack (no negociable)

Next.js 14.2 App Router + TypeScript · Tailwind + dark-mode-first · Supabase (Auth + Postgres con RLS) · OpenRouter para LLM con streaming + tool calling · `next-intl` para i18n (es/en) · `lucide-react` · Vercel.

## Arquitectura — el "big picture"

### Routing
- Todas las rutas viven bajo `app/[locale]/` con `localePrefix: 'always'`. `middleware.ts` (solo `next-intl`, ningún check de auth) reescribe `/` → `/es`. `/api/*` queda fuera del matcher.
- Dos route groups: `(auth)` (login/register, layout propio) y `(dashboard)` (coach/dashboard/plan + bottom nav).
- `navigation.ts` reexporta los helpers locale-aware (`Link`, `useRouter`, etc.) — **úsalos en vez de los de `next/navigation`** para mantener el prefijo de idioma.

### Auth flow (server actions)
`app/actions/auth.ts` ejecuta `signUp` / `signIn` / `signOut` y devuelve `{ success, redirectTo }` en lugar de llamar `redirect()`. El cliente hace `window.location.href = redirectTo`. **No volver a usar `redirect()` aquí** — provocaba loops de redirección con el middleware de `next-intl`.

Email confirmation está desactivado para v1 (la sesión se crea al instante en `signUp`). `signUp` inserta `user_profiles` manualmente porque el trigger SQL no es la ruta canónica en producción.

### Layout del dashboard — sin guards
`app/[locale]/(dashboard)/layout.tsx` **no comprueba** `onboarding_completed` ni `disclaimer_accepted_at`. Cualquier intento previo de hacerlo terminó en loops infinitos con el middleware. Si necesitas reintroducirlos, hazlo con modales en cliente, no con `redirect()`.

### Chat con Kai (`/api/chat`)
Flujo en `app/api/chat/route.ts`:

```
auth → guardar mensaje user → construir 3 capas de memoria en paralelo
  (lib/memory.ts: getUserContext + getRecentMessages + getChatSummaries)
→ buildSystemPrompt + buildMessagesArray
→ callOpenRouterStream (primera llamada con tools=TOOLS, stream=true)
  → processOpenRouterStream parsea SSE, separa contenido y tool_calls
  → si hubo tool_calls: executeTool() por cada una, segunda llamada SIN tools,
    se stream-ea la respuesta final
  → si no: emitir [DONE]
→ guardar respuesta del assistant en chat_messages
```

Tools definidas en `lib/tools.ts`: `update_user_profile`, `mark_onboarding_complete`, `generate_weekly_plan`. La última hace `fetch` interno a `/api/plan/generate` — depende de `NEXT_PUBLIC_APP_URL`.

### Plan semanal
`/api/plan/generate` usa OpenRouter con **structured outputs (JSON schema)**. NO parsear JSON libre. Validar siempre con Zod antes de persistir en `weekly_plans`.

### Memoria de Kai (3 capas, todas en `lib/memory.ts`)
1. **Contexto del usuario** (on-the-fly desde BD): `user_profiles`, últimos 3 pesajes, métricas 7 días, plan activo, workouts 7 días, lesiones activas extraídas de `metadata_biometrica`. Se serializa como bloque de texto al system prompt.
2. **Mensajes recientes**: últimos 20 de `chat_messages`.
3. **Resúmenes**: últimos 5 de `chat_summaries` (no se generan automáticamente todavía).

### Supabase
- `lib/supabase/server.ts` para Server Components / API routes / actions; `lib/supabase/client.ts` para componentes cliente.
- **RLS activado en todas las tablas** (`001_initial_schema.sql`). Política base: `auth.uid() = user_id`. Mantener este invariante en migraciones nuevas.
- `user_profiles.metadata_biometrica` es `jsonb` libre — la app pone ahí objetivo, equipamiento, lesiones, etc. No hay schema duro.

## Bugs críticos conocidos (no romper más al tocarlos)

1. **Onboarding loop**: el modelo no llama `mark_onboarding_complete` de forma confiable. Antes de re-escribir el system prompt o las tools, lee `docs/ESTADO_ACTUAL.md` (sección Bug #1) — ya se intentaron 3 enfoques. Las opciones reales son: cambiar modelo, hardcoded detection en backend, o wizard estructurado.
2. **SSE se cuelga**: streaming se rompe intermitentemente. Hay buffer en frontend (`components/chat/use-chat-stream.ts`) y manejo de errores en backend, pero no es 100% confiable. Cualquier cambio en `processOpenRouterStream` debe preservar el `[DONE]` final en todos los paths.
3. **Service Worker**: `public/sw.js` es solo un kill-switch que se desregistra a sí mismo. **No hay PWA real**. Si vas a meter SW real, primero desactiva el kill-switch.

## Modelo LLM actual

`OPENROUTER_DEFAULT_MODEL=google/gemini-3-flash-preview` (barato pero no respeta tool calling consistentemente). El fallback en código es `anthropic/claude-3.5-sonnet`. Antes de pelearse con el system prompt, vale la pena probar Claude o GPT-4o.

## Design system — reglas con trampa

- Accent `#E5FF00` (amarillo nitro). **Texto sobre accent siempre `#0A0E14`** — usa `text-on-accent`, nunca blanco.
- Éxito/verde es `#4ADE80` (`status-success`), **no** el accent.
- Dark mode first. Modo claro es v2 — no añadir variantes `light:` todavía.
- `Inter` para UI, `JetBrains Mono` para números/métricas.
- Lucide-react con peso 1.5 para iconos.

## Bloques especiales de Kai en markdown

Kai puede emitir ` ```kinetica:plan-card `, ` ```kinetica:chart `, ` ```kinetica:alert ` dentro del stream. El parser de `components/chat/markdown-renderer.tsx` debe ser stateful. Si un bloque no se reconoce: **degradación segura → renderizar como bloque de código**, no romper.

## Seguridad de variables de entorno

- `SUPABASE_SERVICE_ROLE_KEY` y `OPENROUTER_API_KEY` son **solo server-side**. Nunca prefijar con `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_APP_URL` se usa para fetchs internos del backend a sus propias rutas (ej. tool `generate_weekly_plan`). En dev fallback a `http://localhost:3000`.

## Git workflow

Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`). Carlos pide commits explícitamente — no commitear de forma automática. Cambios lógicamente distintos → commits separados.
