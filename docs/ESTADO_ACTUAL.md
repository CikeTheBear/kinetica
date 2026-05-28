# ESTADO ACTUAL — Kinética (Handoff técnico, 28 May 2026)

> Documento para el próximo agente que retome el proyecto. Lee `TODO.md` primero (estado funcional resumido) y luego este (detalles técnicos y reproducción del bug activo).

---

## TL;DR

- El proyecto está **funcional en su mayor parte**: auth, chat de Kai sin bucle, onboarding determinístico, generación de plan con ejercicios reales de wger.de validados.
- **Hay un bug activo**: en la pestaña Plan, el botón "Regenerar" llama al backend (que genera y persiste un plan nuevo y distinto cada vez, verificado en log), pero **la UI no refresca lo que muestra**. Tu primera misión es cerrarlo.
- Estamos en la rama **`feature/wger-integration`** con 2 commits sobre `develop`. NO mergear hasta validar el bug.
- Producción: https://kinetica-delta.vercel.app · Supabase: `focbdmounzgaujtirvno`.

---

## Lo que se logró en la sesión anterior (cronológico)

Esta sesión empezó con un proyecto heredado de otro agente que dejó múltiples bugs críticos. Se resolvieron:

1. **Auditoría profunda** (5 dominios en paralelo: chat, plan, auth, schema, frontend). Hallazgos consolidados y priorizados.
2. **Chat de Kai sin bucle de onboarding**:
   - Buffer SSE correcto en backend (antes se colgaba el chat).
   - Onboarding determinístico en backend (`lib/onboarding.ts: isOnboardingDataComplete`). El LLM no marca el flag; lo hace `updateUserProfile` cuando los 5 datos canónicos están guardados.
   - System prompt condicional (`app/api/chat/route.ts`): si `onboarding_completed` es true, entra en "modo coach" sin instrucciones de recopilar.
   - Se guarda el contenido REAL de la 2ª llamada (no placeholder); antes corrompía el historial y causaba el bucle.
   - `getRecentMessages` ahora trae los 20 más RECIENTES (antes los 20 más antiguos).
   - Tests vitest sobre `isOnboardingDataComplete` (11 casos en verde).
3. **Generación de plan robusta**:
   - Lógica extraída a `lib/plan.ts: generatePlanForUser(userId)`, llamable in-process desde la tool de Kai (antes la tool hacía fetch HTTP a producción sin cookies → 401, nunca generaba).
   - Eliminado `response_format: json_schema`: Bedrock (proveedor de Claude vía OpenRouter) rechaza constraints como `minItems`/`minimum`/`maximum`. Ahora el formato se pide por prompt y se valida con Zod.
   - Reintentos con backoff (3 intentos). `getNextMonday` con timezone local correcta.
   - Validación dura: `wger_id` deben existir en el catálogo pasado al LLM; si inventa uno, reintenta.
4. **Auth y locale**: redirects con locale activo (antes hardcodeaba `/es/`), guard en `disclaimer`, eliminado insert manual redundante (lo cubre el trigger SQL).
5. **UI y limpieza**: banner de onboarding en Dashboard en vez de redirect forzado a Coach, i18n extraído a `messages/`, fuentes via `next/font` sin doble carga, código muerto (`lib/wger.ts` viejo) eliminado.
6. **Migración de ramas**: el repo pasó de `master` a `main` + `develop` siguiendo el flujo de Carlos.
7. **Integración real de wger.de**: (rama `feature/wger-integration`, 2 commits)
   - `lib/supabase/admin.ts` con service_role para escribir `exercises_cache`.
   - `lib/wger.ts` reconstruido: cliente del catálogo, sync, y `getCatalogForUser` (filtra por equipamiento del usuario con mapeo Kinética ↔ wger).
   - `POST /api/admin/sync-exercises` protegido con `SYNC_SECRET` (ejecutar 1 vez para poblar, luego cron).
   - `lib/plan.ts` pasa el catálogo al LLM y valida que ningún `wger_id` se invente.
   - `exercises_cache` ya tiene 846 ejercicios reales en BD.
   - Fix de regenerar: ya no devuelve 409; reemplaza el plan de la semana solo si el nuevo es válido (borra viejo entonces).

---

## 🐛 Bug activo a cerrar

### Síntoma
En la pestaña Plan (`/[locale]/(dashboard)/plan`), el usuario tiene un plan visible. Pulsa el botón "Regenerar". El botón muestra estado de carga (~20s) y vuelve a activo. **Pero el plan que se muestra en pantalla no cambia en absolutamente nada.**

### Diagnóstico ya hecho (verificable)

Se añadió instrumentación temporal (`console.log` de los `wger_id` generados) y se confirmó por log que **el backend produce planes distintos en cada regeneración**:

```
1ª  lun:[1277,1198,1228,1270,1713] mar:[1186,154,1225,1473,1394] ...
2ª  lun:[539,1219,1467,1296,1919]  mar:[1471,1542,1192,1458,1399] ...
```

También:
- `POST /api/plan/generate 200` con duración ~20s (el LLM corre de verdad).
- Sin errores `[plan]` en el log: el plan pasa Zod y la validación de `wger_id` contra el catálogo.
- El endpoint devuelve `{ success: true, plan: insertedPlan, message }`, donde `insertedPlan` es la fila completa de `weekly_plans` con `plan_json` actualizado.

La instrumentación de debug se revirtió antes de cerrar la sesión. El código está limpio.

### Hipótesis pendientes (en orden de probabilidad)

**1. Caché del navegador / Service Worker antiguo.**

El SW actual (`public/sw.js`) es un kill-switch benigno (no intercepta fetches). Pero si Carlos tiene un SW de versiones anteriores del proyecto registrado en su navegador, podría seguir interceptando o cacheando.

**Cómo descartarlo (acción de Carlos):**
1. F12 → Application → Service Workers → `Unregister` cualquier SW activo.
2. F12 → Application → Clear storage → Clear site data.
3. Ctrl+F5 (hard reload).
4. Regenerar el plan. Si funciona, era el SW residual.

**2. Bug sutil de React en el render.**

Si tras hard refresh el bug persiste, el siguiente paso es **instrumentar el cliente**. Añadir en `components/plan/weekly-plan-view.tsx`, dentro de `handleGeneratePlan`, justo antes del `setPlan(data.plan)`:

```ts
console.log('[plan][client] data recibido:', data);
console.log('[plan][client] huella lunes:', data?.plan?.plan_json?.dias?.[0]?.ejercicios?.map(e => e.wger_id));
```

Pedir a Carlos que regenere 2 veces con DevTools Console abierto.

- Si las dos huellas en consola son **distintas** → la UI recibe planes diferentes pero el render no los pinta. Probable causa: las `key={dia.dia}` de los `DayCard` (siempre lunes..domingo) hacen que React reutilice los componentes; alguna referencia interna podría estar atascada. Investigar: forzar nueva key añadiendo el `id` del plan (`key={\`${plan.id}-${dia.dia}\`}`), o un `React.useEffect` que reaccione a cambios en `plan.id`.
- Si las dos huellas son **idénticas** → el navegador está cacheando la respuesta del POST de alguna forma. Investigar headers de respuesta de `/api/plan/generate` (añadir `Cache-Control: no-store`) o el SW.

### Archivos clave para este bug

- `components/plan/weekly-plan-view.tsx` — la UI.
- `app/api/plan/generate/route.ts` — el endpoint que devuelve el plan nuevo.
- `app/api/plan/active/route.ts` — endpoint que carga el plan al montar.
- `public/sw.js`, `components/service-worker-register.tsx` — Service Worker.
- `lib/plan.ts` — **NO tocar para este bug** (el backend ya está confirmado correcto).

---

## Arquitectura — mapa rápido

```
app/
├── api/
│   ├── chat/route.ts          # SSE streaming + tools de Kai
│   ├── plan/
│   │   ├── generate/route.ts  # POST: delega en generatePlanForUser
│   │   └── active/route.ts    # GET: plan activo del usuario
│   └── admin/
│       └── sync-exercises/route.ts  # POST protegido con SYNC_SECRET
├── actions/auth.ts             # signUp/signIn/signOut (devuelven redirectTo, no redirect())
└── [locale]/                   # i18n routing (next-intl, localePrefix 'always')
    ├── (auth)/login, register
    ├── (dashboard)/dashboard, plan, coach
    └── disclaimer/             # server component con guard

lib/
├── plan.ts                     # ⭐ generación de plan (Zod, retries, catálogo wger)
├── wger.ts                     # ⭐ cliente wger + sync + getCatalogForUser
├── tools.ts                    # tools de Kai (update_user_profile, generate_weekly_plan)
├── memory.ts                   # 3 capas de memoria para Kai
├── onboarding.ts               # isOnboardingDataComplete (determinístico)
├── auth.ts                     # requireUser
└── supabase/
    ├── server.ts               # cliente de sesión (anon)
    ├── client.ts               # cliente browser
    └── admin.ts                # ⭐ cliente service_role (escribe exercises_cache)

components/
├── chat/coach-chat.tsx, use-chat-stream.ts, chat-message.tsx, markdown-renderer.tsx
├── plan/weekly-plan-view.tsx   # ⭐ AQUÍ está el bug activo
├── auth/login-form, register-form, user-menu
└── bottom-nav.tsx, service-worker-register.tsx
```

## Comandos útiles

```bash
npm run dev         # dev server (suele subir en :3000 o :3001 si ocupado)
npm run typecheck   # tsc --noEmit
npm run test        # vitest --run
npm run build       # build de producción

# Sincronizar exercises_cache (poblar/refrescar el catálogo de wger):
curl -X POST http://localhost:3001/api/admin/sync-exercises \
     -H "Authorization: Bearer $SYNC_SECRET"

vercel logs kinetica-delta.vercel.app --json   # logs de producción
```

## Schema canónico de `metadata_biometrica`

Ver `docs/kinetica_setup.md` sección 3. Los 5 datos mínimos de onboarding (verificados por `isOnboardingDataComplete`):

- `objetivo_principal` (enum)
- `edad`, `altura_cm`, `peso_inicial_kg` (números)
- `dias_disponibles` (número)
- `equipamiento` (array no vacío, enum de categorías de Kinética)
- `lesiones_activas` (array; puede ser `[]` = preguntado, sin lesiones)

## Mapeo de equipamiento Kinética ↔ wger

En `lib/wger.ts: EQUIPMENT_MAP` y `SIN_FILTRO`. Resumen:

- `peso_corporal_solo` → bodyweight + gym mat
- `bandas_elasticas` → + resistance band
- `mancuernas_basicas` → + dumbbell, kettlebell, bench, incline bench
- `home_gym_completo`, `gimnasio_comercial`, `otro` → sin filtro (todo el catálogo)

---

## Política de cambios y commits

- Flujo: features salen de `develop`; commits importantes a `main` como nuevas versiones.
- Commits con Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- **No hacer commits sin pedirle a Carlos**. Sugerir el mensaje y esperar OK.
- **No hacer push sin permiso explícito**.
- Cambios importantes en arquitectura → confirmar antes de codear.

## Memoria entre sesiones (auto-memory)

Si tienes acceso al sistema de auto-memory del usuario (ruta local `C:\Users\dealm\.claude-kluge\projects\C--00-CARLOS-C-02-CikeTheBear-kinetica\memory\`), hay 3 memorias clave:

- `project_handoff.md`: el proyecto vino de otro agente que no funcionaba.
- `feedback_onboarding_conversacional.md`: el onboarding debe ser chat natural con Kai, NO wizard.
- `feedback_git_workflow.md`: main/develop/feature flow.

Si NO tienes acceso (cuenta distinta de Claude), todo el contexto crítico está en este archivo y en `TODO.md`.
