# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Antes de tocar nada — orden de lectura obligatorio

`TODO.md` es la **fuente de verdad** del estado real (qué funciona, qué está roto, qué falta) y se actualiza cada sesión. `docs/ESTADO_ACTUAL.md` complementa con el handoff técnico detallado (diagnóstico del bug activo, mapa de archivos, próximos pasos). El PRD describe la visión, no el estado.

1. `TODO.md` — Estado REAL al cierre de la última sesión.
2. `docs/ESTADO_ACTUAL.md` — Handoff técnico detallado.
3. `docs/kinetica_prd.md` — Visión del producto (PUEDE estar desactualizado respecto al código).
4. `docs/kai_identity.md` — Personalidad, system prompt, límites de Kai.
5. `docs/kinetica_setup.md` — Variables de entorno, schema canónico de `metadata_biometrica`, design system.
6. `AGENTS.md` — Resumen para agentes IA (puede estar desfasado; manda `TODO.md`).

Producción: **https://kinetica-delta.vercel.app** · Supabase: `focbdmounzgaujtirvno`.

## Preferencias y decisiones de Carlos (NO ignorar)

Estas no se deducen del código y han costado de descubrir. Respétalas o pregunta antes de cambiarlas.

- **El onboarding es chat conversacional con Kai, NO wizard.** Carlos lo prefiere por UX. Cuando hubo dudas con el bucle, se descartó explícitamente la "Opción C" (wizard estructurado). La forma correcta de hacerlo robusto es la actual: el LLM solo recopila y guarda datos; el backend (`isOnboardingDataComplete`) decide cuándo el onboarding está completo y marca el flag.
- **Git workflow**: rama principal `main` (no `master`), `develop` para desarrollo, features y fixes salen de `develop`. A `main` solo lo importante (versiones). Conventional Commits.
- **Nunca commitear sin pedirle**. Sugerir el mensaje y esperar OK.
- **Nunca hacer push sin permiso explícito.**
- **Si dudas entre rapidez y robustez, elige robustez**. En esta sesión Carlos lo pidió varias veces de forma directa (criterio: "¿yo lo habría hecho así? Si no, hazlo bien").

## Comandos

```bash
npm run dev         # Next dev server (suele subir en :3000 o :3001 si ocupado)
npm run build       # Build de producción
npm run start       # Servir build
npm run lint        # ESLint (next lint)
npm run typecheck   # tsc --noEmit
npm run test        # vitest (run único)
npm run test:e2e    # playwright (sin tests escritos aún)

# Poblar/refrescar exercises_cache desde wger:
curl -X POST http://localhost:3001/api/admin/sync-exercises \
     -H "Authorization: Bearer $SYNC_SECRET"

vercel --prod                                  # Deploy manual
vercel logs kinetica-delta.vercel.app --json   # Logs producción
```

## Stack (no negociable)

Next.js 14.2 App Router + TypeScript · Tailwind + dark-mode-first · Supabase (Auth + Postgres con RLS) · OpenRouter para LLM con streaming + tool calling · `next-intl` para i18n (es/en) · `lucide-react` · `framer-motion` para animaciones · Zod para validación · Vercel.

## Modelo LLM

`OPENROUTER_DEFAULT_MODEL=anthropic/claude-haiku-4.5` (configurado en `.env.local` y Vercel). Fallback en código a Haiku también. Buen tool calling y siguiendo instrucciones; razonablemente económico.

**Importante**: OpenRouter enruta cada modelo a un proveedor distinto. Claude se sirve vía **Amazon Bedrock**, que **no soporta el mismo subconjunto de JSON Schema que OpenAI** (rechaza `minItems > 1`, `minimum`/`maximum` en integers, etc.). Por eso la generación de plan **no usa `response_format: json_schema`**; pide JSON por prompt y valida con Zod. Es portable a cualquier modelo.

## Arquitectura — el "big picture"

### Routing
- Rutas bajo `app/[locale]/` con `localePrefix: 'always'`. `middleware.ts` (solo `next-intl`) reescribe `/` → `/es`. `/api/*` queda fuera del matcher.
- Route groups: `(auth)` (login/register) y `(dashboard)` (coach/dashboard/plan + bottom nav).
- `navigation.ts` reexporta helpers locale-aware (`Link`, `useRouter`...). **Úsalos en vez de los de `next/navigation`** para preservar el prefijo de idioma.

### Auth flow (server actions)
`app/actions/auth.ts` devuelve `{ success, redirectTo }` en lugar de llamar `redirect()`. El cliente hace `window.location.href = redirectTo`. **No volver a `redirect()`** — provocaba loops con `next-intl`.

- `signUp`/`signIn`/`signOut` reciben el `locale` (de un hidden field del form o como argumento) y construyen el redirect con `/${locale}/...`.
- Email confirmation desactivado para v1.
- **`signUp` NO inserta `user_profiles` manualmente**: el trigger SQL `handle_new_user` (migración 002) lo hace con `ON CONFLICT (id) DO NOTHING`. Lleva nombre desde `raw_user_meta_data->>'nombre'`.
- Destino post-login unificado a `/dashboard`.
- `disclaimer` tiene su propio guard de sesión (Server Component); no se mueve al grupo `(dashboard)`.

### Layout del dashboard — sin redirect forzado
`app/[locale]/(dashboard)/dashboard/page.tsx` **no** redirige al onboarding si está incompleto. En su lugar muestra un **banner acogedor** con link a `/coach?onboarding=true`. Los redirects de onboarding causaban loops; el banner es la solución consensuada.

### Chat con Kai (`app/api/chat/route.ts`)
```
auth → guardar mensaje user → 3 capas de memoria en paralelo
  (lib/memory.ts: getUserContext + getRecentMessages + getChatSummaries)
→ buildSystemPrompt CONDICIONAL (modo onboarding vs modo coach)
→ callOpenRouterStream (1ª llamada con tools)
  → processOpenRouterStream con BUFFER entre lecturas (no perder SSE partidos)
  → si hubo tool_calls: executeTool() + 2ª llamada sin tools
→ guardar el contenido REAL (1ª + 2ª llamada) en chat_messages
```

- **Tools** (`lib/tools.ts`): `update_user_profile`, `generate_weekly_plan`.
- `generate_weekly_plan` llama **in-process** a `lib/plan.ts: generatePlanForUser(userId)`. **NO hace fetch HTTP interno** (eso fallaba con 401 por no pasar cookies).
- `getRecentMessages` trae los 20 **más recientes** (no los más antiguos — bug histórico ya arreglado).

### Onboarding determinístico
- El LLM solo recopila datos y los guarda con `update_user_profile` usando el schema canónico de `metadata_biometrica` (ver `docs/kinetica_setup.md` §3 y `lib/onboarding.ts: isOnboardingDataComplete`).
- El backend reevalúa tras cada `update_user_profile` y marca `onboarding_completed = true` solo, sin depender del LLM. Esto mató el bucle de onboarding.
- 5 datos mínimos: `objetivo_principal`, `edad` + `altura_cm` + `peso_inicial_kg`, `dias_disponibles`, `equipamiento` (array no vacío), `lesiones_activas` (clave existe = preguntado; `[]` = sin lesiones).
- Tests: `tests/onboarding.test.ts` (11 casos, vitest).

### Generación de plan semanal (`lib/plan.ts`)
- Función `generatePlanForUser(userId)` reutilizable (endpoint y tool de Kai la llaman).
- **No usa `response_format: json_schema`**: incompatible con Bedrock/Claude. Pide JSON por prompt y valida con Zod (rangos, enums, longitud 7 días, `wger_id` ∈ catálogo).
- Reintentos: 3 con backoff. `temperature: 0.8` + semilla de variación para que regenerar dé planes distintos.
- `getNextMonday` usa componentes locales (no `toISOString` → UTC); evita off-by-one en GMT-4.
- **Regenerar reemplaza el plan de la semana** (no devuelve 409). Genera y valida primero; si el nuevo es válido, borra el anterior e inserta. Si falla, el viejo queda intacto.

### Integración real con wger.de — feature/wger-integration
- **`exercises_cache`** está poblado con ~846 ejercicios reales de `wger.de` (PK: `wger_id`). Su RLS es `WITH CHECK(false)` para el cliente normal → **se escribe con `lib/supabase/admin.ts` (service_role)**.
- `lib/wger.ts`: cliente del catálogo (`/exerciseinfo/`), `syncExercisesCache()`, y `getCatalogForUser(equipamiento)` que filtra el catálogo según el equipamiento del usuario (mapeo Kinética ↔ nombres de wger en `EQUIPMENT_MAP`).
- `POST /api/admin/sync-exercises` protegido con `SYNC_SECRET` para repoblar el cache a demanda.
- En la generación, al LLM se le pasa el catálogo filtrado como `wger_id | nombre | grupo muscular` y se le ordena usar SOLO esos IDs. **Validación dura post-Zod**: si algún `wger_id` no está en el catálogo, reintenta. Esto cierra el agujero de ejercicios inventados.

### Memoria de Kai (3 capas, `lib/memory.ts`)
1. **`getUserContext(userId)`** — on-the-fly desde BD. Devuelve `{ context: string, onboardingCompleted: boolean, hasProfile: boolean }` (¡no string!).
2. **`getRecentMessages`** — últimos 20 mensajes en orden cronológico.
3. **`getChatSummaries`** — últimos 5 resúmenes (no se generan automáticamente todavía).

### Supabase
- `lib/supabase/server.ts` para Server Components / API routes / actions (cliente de sesión).
- `lib/supabase/client.ts` para componentes cliente.
- `lib/supabase/admin.ts` para **escribir tablas globales con RLS restrictiva** (ej. `exercises_cache`). Server-only.
- **RLS en todas las tablas** (`001_initial_schema.sql`). Política base: `auth.uid() = user_id`. Mantener este invariante en migraciones.

## Estado actual

Casi todo el flujo funciona. Hay **un bug activo**: tras regenerar el plan en la pestaña Plan, la UI no refresca lo que muestra (backend verificado produce planes distintos). Hipótesis: Service Worker antiguo cacheado, o bug sutil de React. Detalle completo y plan de diagnóstico en `docs/ESTADO_ACTUAL.md` § "Bug activo a cerrar". **Tocar `components/plan/weekly-plan-view.tsx`, NO `lib/plan.ts`**.

Pendientes:
- Cerrar ese bug → validar → mergear `feature/wger-integration` → `develop`.
- Siguiente feature recomendada: **"En el Ruedo"** (modo ejecución del entrenamiento con timer).
- Iconos PWA definitivos (Carlos los hace; ahora hay un SVG placeholder).

## Design system — reglas con trampa

- Accent `#E5FF00` (amarillo nitro). **Texto sobre accent SIEMPRE `#0A0E14`** — usa la clase `text-on-accent`, nunca blanco.
- Éxito/verde es `#4ADE80` (`status-success`), **no** el accent.
- Dark mode first. Modo claro es v2 — no añadir variantes `light:`.
- `Inter` para UI, `JetBrains Mono` para números/métricas (variables de `next/font` en `layout.tsx`).
- `lucide-react` con peso 1.5 para iconos.

## Bloques especiales de Kai en markdown

Kai puede emitir ` ```kinetica:plan-card `, ` ```kinetica:chart `, ` ```kinetica:alert ` dentro del stream. El parser está en `components/chat/chat-message.tsx` y `markdown-renderer.tsx`. Si un bloque no se reconoce: **degradación segura → renderizar como bloque de código**, no romper.

## Seguridad de variables de entorno

Server-only (NUNCA `NEXT_PUBLIC_`): `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `SYNC_SECRET`.

Públicas (`NEXT_PUBLIC_*`): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Trampas conocidas (cosas que ya se rompieron y se arreglaron)

- **Hot-reload de Next es poco fiable** en este proyecto. Tras cambiar `lib/plan.ts` o módulos del backend, **reinicia el dev server** (matar PID en :3001 y `npm run dev`) en vez de confiar en HMR. El error 400 con `minItems` apareció varias veces por bundle viejo en cache.
- **Trabajo paralelo con subagentes que tocan archivos compartidos**: si lanzas varios subagentes editando, comprueba la coherencia de firmas (ej. `getUserContext` cambió de devolver string a objeto y rompió `lib/plan.ts` porque otro agente asumía la firma vieja). El typecheck no lo atrapa si el cambio es string→object.
- **`scripts/setup-auth-trigger.ts` está roto** (documentado en el propio archivo): usa la `service_role` key como password de Postgres, lo cual no es. Requiere la DB password real.
