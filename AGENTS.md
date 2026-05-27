> ⚠️ **Orden de autoridad cuando los docs se contradigan: `TODO.md` > `docs/ESTADO_ACTUAL.md` > este archivo > `docs/kinetica_prd.md`.**
> `TODO.md` refleja el estado real más reciente. El PRD describe la visión objetivo, no lo implementado.

# AGENTS.md — Kinética (Estado Actualizado Mayo 2026)

## Estado del repositorio

⚠️ **Este repositorio YA TIENE CÓDIGO IMPLEMENTADO.** No es solo especificaciones.

La app está deployada en producción: **https://kinetica-delta.vercel.app**

Hay código funcional para autenticación, chat con SSE streaming, tool calling, generación de planes semanales, y UI base. Sin embargo, hay **bugs críticos conocidos** que necesitan atención.

## Fuente única de verdad — orden de lectura obligatorio

Antes de tocar cualquier archivo, leer en este orden:

1. `TODO.md` — **ESTADO REAL DEL PROYECTO.** Qué funciona, qué está roto, qué falta. Este es el documento más importante.
2. `docs/kinetica_prd.md` — Visión, arquitectura, schema de Supabase, sprints.
3. `docs/kai_identity.md` — Personalidad, system prompt, comportamiento y límites del agente conversacional Kai.
4. `docs/kinetica_setup.md` — Variables de entorno, schemas faltantes, política de errores LLM, i18n, design system, testing, disclaimer médico.

Si hay conflicto entre documentos, `TODO.md` gana sobre todo (es el más reciente y refleja el estado real).

## Stack tecnológico mandatorio (no negociable)

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14+ con App Router |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS + shadcn/ui |
| Backend / DB / Auth / Storage | Supabase |
| Scheduling | Supabase Edge Functions + pg_cron |
| LLM | OpenRouter (modelos con structured outputs y tool calling) |
| Hosting | Vercel |
| Catálogo ejercicios | wger.de REST API |
| Videos | YouTube Data API v3 |
| Testing | vitest + playwright |
| i18n | next-intl |

## Bugs críticos que DEBES conocer antes de tocar código

### 1. Chat de Kai entra en bucle de onboarding [CRÍTICO]
Cuando el usuario confirma sus datos, Kai repite las preguntas en vez de marcar onboarding como completado. Se han intentado:
- Añadir tool `mark_onboarding_complete`
- Añadir reglas estrictas en system prompt
- Refactor de tool calling con doble llamada al LLM

Nada ha funcionado de forma confiable con el modelo actual.

**Recomendación:** Considerar cambiar el modelo o implementar hardcoded detection en backend.

### 2. Chat se queda en "escribiendo" sin responder [CRÍTICO]
SSE streaming se rompe intermitentemente. Se han añadido buffers, manejo de errores, y refactor de tool calling, pero sigue siendo inestable.

### 3. Service Worker antiguo causa problemas de caché
Kill-switch implementado pero no hay PWA real todavía.

## Decisiones arquitectónicas críticas

- **Dark mode first.** Modo claro es v2.
- **SSE (Server-Sent Events) para streaming del chat.** NO WebSockets.
- **i18n desde el día 1.** Español e inglés.
- **Row Level Security (RLS) en TODAS las tablas de Supabase desde el inicio.**
- **Structured outputs (JSON schema) con OpenRouter.** NO parsear JSON libre.
- **Supabase Edge Functions corren en Deno.** Fuera del runtime de Next.js/Vercel.

## Variables de entorno — reglas de seguridad estrictas
- **Nunca** prefijar con `NEXT_PUBLIC_` variables que deben quedarse en servidor.
- `SUPABASE_SERVICE_ROLE_KEY` es crítico: solo server-side.
- Las Edge Functions usan secrets configurados desde el dashboard de Supabase.

## Design system — reglas no obvias
- Accent color: `#E5FF00` (amarillo nitro). **Texto sobre accent siempre `#0A0E14` (negro).**
- El éxito/verde es `#4ADE80`, **no** el accent.
- `Inter` para UI, `JetBrains Mono` para números/métricas.
- `lucide-react` para iconografía (peso 1.5).

## Testing — prioridad pragmática
- Testear obligatoriamente: parser Apple Health XML, calculadora de señales de alarma, validadores zod, tools que mutan datos, cron jobs core, 1 happy path E2E.
- NO testear: componentes UI sin lógica, el LLM en sí, ni perseguir 100% coverage.

## Quirks de Supabase/Postgres
- `user_profiles.timezone` default `'America/Caracas'`.
- `user_profiles.metadata_biometrica` es `jsonb` con schema canónico.
- `user_profiles` tiene columnas adicionales: `locale` (default 'es') y `disclaimer_accepted_at`.
- Tabla `push_subscriptions` no está en PRD v2 pero es obligatoria.
- `exercises_cache` para cachear ejercicios de wger en español e inglés.

## Quirks del streaming y markdown de Kai
- Kai emite bloques especiales delimitados como ` ```kinetica:plan-card `, ` ```kinetica:chart `, ` ```kinetica:alert `.
- El parser del frontend debe ser stateful.
- Si un bloque no se reconoce, degradación segura: mostrar como código.

## Modelo LLM actual
**`google/gemini-3-flash-preview`** — Económico pero NO respeta bien tool calling ni system prompts complejos.

**Recomendación fuerte:** Cambiar a `anthropic/claude-3.5-sonnet` o `openai/gpt-4o`.

## Contacto / dueño
Carlos. Cualquier ambigüedad entre los docs debería consultarse con él antes de asumir.
