# AGENTS.md — Kinética

## Estado del repositorio
Este repositorio contiene **especificaciones y diseño técnico únicamente**. No hay código implementado todavía. Toda la lógica de negocio, stack y decisiones de arquitectura están en los tres documentos bajo `docs/`.

## Fuente única de verdad — orden de lectura obligatorio
Antes de tocar cualquier archivo, leer en este orden:

1. `docs/kinetica_prd.md` — Visión, arquitectura, schema de Supabase, sprints.
2. `docs/kai_identity.md` — Personalidad, system prompt, comportamiento y límites del agente conversacional Kai.
3. `docs/kinetica_setup.md` — Variables de entorno, schemas faltantes, política de errores LLM, i18n, design system, testing, disclaimer médico.

Si hay conflicto entre documentos, `kinetica_setup.md` gana (es el más reciente y explícito).

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

## Decisiones arquitectónicas críticas que un agente podría pasar por alto
- **Dark mode first.** Modo claro es v2. La app fitness se usa en gimnasios con poca luz.
- **SSE (Server-Sent Events) para streaming del chat.** NO WebSockets. Los LLMs y Vercel lo soportan nativamente; WebSockets no se justifican.
- **i18n desde el día 1.** Español e inglés. Todo string visible va en `/messages/es.json` y `/messages/en.json`. Nunca hardcodear texto en componentes.
- **Row Level Security (RLS) en TODAS las tablas de Supabase desde el inicio.** Políticas explícitas por tabla.
- **Structured outputs (JSON schema) con OpenRouter.** NO parsear JSON libre con `JSON.parse()`.
- **Parser de Apple Health XML en streaming (SAX).** No cargar el XML completo en memoria. Idealmente en Edge Function.
- **Supabase Edge Functions corren en Deno.** Fuera del runtime de Next.js/Vercel.
- **No existe Web API para leer HealthKit desde Safari/PWA.** Las únicas opciones de integración son export XML manual, CSV, o PDF de báscula. Comunicar esto al usuario.

## Variables de entorno — reglas de seguridad estrictas
- **Nunca** prefijar con `NEXT_PUBLIC_` variables que deben quedarse en servidor (API keys, service role keys, VAPID private key).
- `SUPABASE_SERVICE_ROLE_KEY` es crítico: solo server-side.
- Las Edge Functions usan secrets configurados desde el dashboard de Supabase, no env vars de Vercel.

## Design system — reglas no obvias
- Accent color: `#E5FF00` (amarillo nitro). **Texto sobre accent siempre `#0A0E14` (negro).** El blanco sobre amarillo nitro falla WCAG.
- El éxito/verde es `#4ADE80` (`--status-success`), **no** el accent.
- `Inter` para UI, `JetBrains Mono` para números/métricas.
- `framer-motion` para transiciones y streaming indicator.
- `lucide-react` para iconografía (peso 1.5).

## Testing — prioridad pragmática
- Testear obligatoriamente: parser Apple Health XML, calculadora de señales de alarma, validadores zod, tools que mutan datos, cron jobs core, 1 happy path E2E.
- NO testear: componentes UI sin lógica, el LLM en sí, ni perseguir 100% coverage.
- Los tests de tools con LLM validan schema y efectos en BD, no el contenido del output.

## Quirks de Supabase/Postgres
- `user_profiles.timezone` default `'America/Caracas'` — crítico para cron jobs.
- `user_profiles.metadata_biometrica` es `jsonb` con schema canónico (ver `kinetica_setup.md` §3).
- `user_profiles` necesita columnas adicionales no en PRD v2: `locale` (default 'es') y `disclaimer_accepted_at`.
- Tabla `push_subscriptions` no está en PRD v2 pero es obligatoria (schema en `kinetica_setup.md` §2).
- `exercises_cache` para cachear ejercicios de wger en español e inglés.

## Quirks del streaming y markdown de Kai
- Kai emite bloques especiales delimitados como ` ```kinetica:plan-card `, ` ```kinetica:chart `, ` ```kinetica:alert `.
- El parser del frontend debe ser stateful: acumular tokens hasta cerrar el bloque antes de parsear JSON.
- Si un bloque no se reconoce, degradación segura: mostrar como código.

## Contacto / dueño
Carlos. Cualquier ambigüedad entre los tres docs debería consultarse con él antes de asumir.
