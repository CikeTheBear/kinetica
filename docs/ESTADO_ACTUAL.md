# ESTADO ACTUAL — Kinética (Handoff para otro agente)

> Documento creado el 26 May 2026 después de múltiples intentos de arreglar el chat de Kai.
> Lee esto ANTES de tocar cualquier código.

---

## TL;DR

La app está deployada y funcional, pero el **chat de Kai tiene dos bugs críticos**:
1. **Bucle de onboarding** — Kai no sabe cuándo marcar el onboarding como completado
2. **Chat se cuelga** — Streaming SSE se rompe intermitentemente

Todo lo demás (auth, UI base, plan semanal) funciona correctamente.

**URL producción:** https://kinetica-delta.vercel.app
**Supabase:** https://focbdmounzgaujtirvno.supabase.co

---

## Qué funciona (probado en producción)

### ✅ Autenticación
- Registro/login con Supabase Auth
- Email confirmation desactivado para testing
- User profiles se crean automáticamente al registrarse

### ✅ Chat con Kai (parcial)
- Streaming SSE funciona para mensajes simples
- Markdown renderer (negritas, listas, tablas)
- Memoria de 3 capas implementada (contexto + mensajes recientes + resúmenes)
- Tool `update_user_profile` funciona (Kai puede guardar datos del usuario)
- Onboarding conversacional: Kai pide los 5 datos necesarios

### ✅ Plan Semanal
- Endpoint `/api/plan/generate` genera plan vía OpenRouter structured outputs
- Validación Zod incluida
- Renderizado básico en UI

### ✅ UI Base
- Dark mode completo
- Bottom nav con 3 tabs
- i18n básico (es/en)
- Multiline textarea para chat

---

## 🐛 Bugs Críticos Detallados

### Bug #1: Bucle de Onboarding

**Síntoma:**
Usuario: "Generalo, por favor"
Kai: "Carlos, ya tengo tu perfil cargado... ¿Confirmas que quieres que genere tu plan?"
Usuario: "Si, generalo"
Kai: "Entendido, Carlos. Vamos a formalizar esto... Responde con precisión: Objetivo, datos básicos, disponibilidad..."

→ Kai vuelve a preguntar los datos que YA tiene.

**Arquitectura actual del onboarding:**

```
Frontend (coach-chat.tsx)
  → useChatStream.ts (maneja SSE)
    → POST /api/chat/route.ts
      → Construye system prompt + mensajes
      → Llama OpenRouter con tools
      → Si hay tool calls, ejecuta y hace segunda llamada
      → Stream resultado al cliente
```

**Qué se ha intentado:**

1. **Tool `mark_onboarding_complete`** (`lib/tools.ts` línea ~50)
   - Función que actualiza `user_profiles.onboarding_completed = true`
   - Kai a veces la llama, a veces no, a veces finge que la llamó

2. **Reglas en system prompt** (`app/api/chat/route.ts` líneas ~87-92)
   - Se añadieron reglas estrictas:
     - "Cuando tengas los 5 datos, llama mark_onboarding_complete INMEDIATAMENTE"
     - "Si onboarding_completed = true, NUNCA preguntes estos datos"
   - El modelo las ignora o las olvida a mitad de conversación

3. **Tool calling con doble llamada** (`app/api/chat/route.ts`)
   - Primera llamada: LLM decide si usar tools
   - Si usa tools: se ejecutan y se hace segunda llamada con resultados
   - Segunda llamada: LLM genera respuesta final
   - Implementado pero el modelo sigue sin ser confiable

**Por qué falla:**

El modelo actual es `google/gemini-3-flash-preview`. Es económico pero:
- No respeta bien system prompts complejos con muchas reglas
- No es determinístico en tool calling (a veces responde en texto, a veces llama tool)
- Tiene "memory" corta: olvida instrucciones del system prompt en conversaciones largas

**Soluciones posibles:**

**Opción A — Cambiar modelo (rápido)**
- Cambiar `OPENROUTER_DEFAULT_MODEL` a `anthropic/claude-3.5-sonnet` o `openai/gpt-4o`
- Son más caros pero respetan system prompts y tool calling
- Estimado: $0.05-0.15 por conversación de onboarding vs $0.01 con Flash

**Opción B — Hardcoded detection en backend (robusto)**
- En el backend, detectar cuando el usuario ha confirmado los datos
- Si tenemos los 5 datos y el usuario dice "si, generalo" → forzar llamada a `mark_onboarding_complete`
- Luego forzar llamada a `generate_weekly_plan`
- No depender del LLM para lógica de negocio crítica

**Opción C — Wizard estructurado + chat separado (re-arquitectura)**
- Crear wizard de onboarding con pasos estructurados (formularios)
- Kai NO guía el onboarding, solo aparece al final para confirmar
- Chat es solo para preguntas, no para recopilar datos estructurados

---

### Bug #2: Chat se cuelga (SSE streaming)

**Síntoma:**
Después de 1-3 mensajes, el indicador de "escribiendo" aparece pero Kai nunca responde.

**Implementación actual del streaming:**

**Backend** (`app/api/chat/route.ts`):
```typescript
// Primera llamada a OpenRouter
const firstResponse = await fetchOpenRouter(messages, apiKey, model, true);

// Procesa stream
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Parsea chunks SSE
  // Detecta tool calls
  // Envía tokens al cliente
}

// Si hubo tool calls, segunda llamada
if (result.toolCalls.length > 0) {
  // Ejecuta tools
  // Segunda llamada sin tools
  // Stream respuesta final
}
```

**Frontend** (`components/chat/use-chat-stream.ts`):
```typescript
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Guarda línea incompleta
  
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    // Parsea JSON
  }
}
```

**Problemas conocidos:**

1. **OpenRouter envía chunks fragmentados** — A veces un chunk SSE llega partido en medio de un JSON. El buffer maneja líneas incompletas pero a veces el JSON dentro de la línea también está partido.

2. **Tool calls interrumpen el stream** — Cuando Kai decide usar una tool, el stream de tokens se detiene. Si la segunda llamada falla, el cliente nunca recibe `[DONE]`.

3. **AbortController no se limpia** — Si el usuario envía un mensaje mientras el anterior está cargando, el abort puede dejar el stream en estado inconsistente.

**Qué ya se intentó:**
- Buffer de líneas en frontend (guarda línea incompleta entre chunks)
- Manejo de errores try/catch en ambos lados
- Refactor de tool calling para que siempre haya segunda llamada
- `streamEnded` flag para asegurar `[DONE]`

**Estado:** Parcialmente mejorado pero no 100% confiable. Requiere más trabajo.

---

## 🏗️ Arquitectura del Código

### Archivos clave y su propósito

```
app/
├── api/
│   ├── chat/
│   │   └── route.ts           # POST /api/chat — SSE streaming con OpenRouter
│   └── plan/
│       ├── generate/
│       │   └── route.ts       # POST /api/plan/generate — genera plan con structured output
│       └── active/
│           └── route.ts       # GET /api/plan/active — devuelve plan semanal actual
├── actions/
│   ├── auth.ts                # Server actions: login, register, logout (NO redirect, return {success, redirectTo})
│   └── disclaimer.ts        # Server action para aceptar disclaimer
├── [locale]/                  # Rutas i18n
│   ├── (dashboard)/
│   │   ├── layout.tsx         # Layout con bottom nav (NO checks de onboarding/disclaimer para evitar loops)
│   │   ├── dashboard/
│   │   │   └── page.tsx       # Tab Dashboard (placeholder)
│   │   ├── coach/
│   │   │   └── page.tsx       # Tab Coach (chat con Kai)
│   │   └── plan/
│   │       └── page.tsx       # Tab Plan (vista semanal)
│   ├── login/
│   │   └── page.tsx           # Login page
│   ├── register/
│   │   └── page.tsx           # Register page
│   └── disclaimer/
│       └── page.tsx           # Disclaimer médico (desactivado temporalmente)

components/
├── chat/
│   ├── coach-chat.tsx         # Componente principal del chat (textarea, scroll, onboarding auto-init)
│   ├── use-chat-stream.ts     # Hook SSE: fetch, parse chunks, manejar errores
│   ├── chat-message.tsx       # Bubble de mensaje (user/assistant, streaming state)
│   └── markdown-renderer.tsx  # Renderiza markdown con bloques especiales kinetica:*
├── plan/
│   └── weekly-plan-view.tsx   # Vista del plan semanal
├── auth/
│   ├── login-form.tsx
│   ├── register-form.tsx
│   └── user-menu.tsx          # Dropdown con logout
├── bottom-nav.tsx             # Barra de navegación inferior (3 tabs)
└── service-worker-register.tsx # Registra SW (desactivado temporalmente)

lib/
├── tools.ts                   # Definición y ejecución de tools de Kai
├── memory.ts                  # Capas de memoria: contexto, mensajes recientes, resúmenes
├── onboarding.ts              # Helpers para onboarding (usado en auth)
├── wger.ts                    # Cliente wger.de API (ejercicios)
├── auth.ts                    # Helpers de autenticación
└── supabase/
    ├── server.ts              # Cliente Supabase server-side
    └── client.ts              # Cliente Supabase client-side

public/
├── manifest.json              # PWA manifest
├── sw.js                      # Service Worker kill-switch (desregistra SWs antiguos)
└── icon-192x192.png           # Icono placeholder
```

### Flujo de datos del chat

```
Usuario escribe → coach-chat.tsx → use-chat-stream.ts
  → POST /api/chat
    → auth (verifica usuario)
    → guarda mensaje en chat_messages
    → getUserContext (metadata_biometrica + perfil)
    → getRecentMessages (últimos 20)
    → getChatSummaries (últimos 5 resúmenes)
    → buildSystemPrompt (junta todo)
    → buildMessagesArray (system + history + mensaje actual)
    → callOpenRouterStream
      → fetch a OpenRouter con stream: true
      → Lee chunks SSE
      → Detecta tool calls
      → Si hay tools:
        → Ejecuta tools (executeTool)
        → Segunda llamada a OpenRouter con resultados
      → Stream tokens al cliente
    → Guarda respuesta en chat_messages
```

---

## ⚠️ Decisiones Técnicas Tomadas (con contexto)

### 1. No usar `redirect()` en server actions
**Por qué:** Causaba loops de redirect con `next-intl` middleware. Las server actions de auth ahora devuelven `{ success: true, redirectTo: '/dashboard' }` y el frontend hace `window.location.href`.

### 2. Eliminados checks de onboarding/disclaimer del layout
**Por qué:** Causaban loops infinitos de redirect. El middleware detectaba `onboarding_completed = false` y redirigía a `/coach?onboarding=true`, pero el layout del dashboard hacía lo mismo.

### 3. Kill-switch en Service Worker
**Por qué:** SWs antiguos cacheaban rutas y causaban que deploys nuevos no se reflejasen. El SW actual (`public/sw.js`) solo se desregistra a sí mismo y limpia caches.

### 4. Modelo económico pero problemático
**Por qué:** Se eligió `google/gemini-3-flash-preview` para mantener costos bajos durante desarrollo. Resultó ser demasiado problemático para tool calling.

### 5. Tool calling con doble llamada
**Por qué:** OpenRouter streaming + tool calling es complejo. La implementación actual hace:
1. Primera llamada: LLM decide usar tools o no
2. Si usa tools: se ejecutan en el backend
3. Segunda llamada: LLM recibe resultados de tools y genera respuesta final
4. Todo se stream al cliente

Es frágil pero es el patrón estándar para streaming + tools.

---

## 🛠️ Próximos Pasos Recomendados

### Prioridad 1 — Arreglar el chat (bloqueante)

**Opción A: Cambiar modelo (más rápido)**
1. Cambiar `OPENROUTER_DEFAULT_MODEL` a `anthropic/claude-3.5-sonnet`
2. Probar onboarding de nuevo
3. Si funciona, problema resuelto

**Opción B: Hardcoded detection (más robusto)**
1. En `app/api/chat/route.ts`, detectar cuando el usuario ha confirmado datos
2. Si `metadata_biometrica` tiene los 5 datos completos y el usuario dice "si/generalo/confirma"
3. Forzar llamada a `mark_onboarding_complete` y `generate_weekly_plan` sin depender del LLM
4. Stream respuesta genérica al usuario

**Opción C: Wizard estructurado (re-arquitectura)**
1. Crear componente wizard con pasos: objetivo → datos → disponibilidad → equipamiento → lesiones
2. Guardar datos en `metadata_biometrica` directamente desde el formulario
3. Marcar `onboarding_completed = true` automáticamente al final
4. Kai aparece SOLO después del wizard, para "coachear", no para recopilar datos

### Prioridad 2 — Re-habilitar features desactivados

1. **Disclaimer médico** — Implementar como modal en vez de redirect a página separada
2. **Onboarding redirect** — Volver a añadir checks pero con lógica segura (no loops)
3. **Service Worker real** — Implementar con estrategia stale-while-revalidate

### Prioridad 3 — Features core faltantes

1. **Registro de entrenamientos** — "En el Ruedo" con timer de descanso
2. **Importación de datos** — Apple Health XML, CSV báscula
3. **Dashboard con gráficas** — Charts de progreso
4. **Videos de ejercicios** — YouTube Data API v3

---

## 🔧 Comandos Útiles

```bash
# Local dev
npm run dev

# Type check
npm run typecheck

# Build
npm run build

# Deploy a producción
vercel --prod

# Ver logs en tiempo real
vercel logs kinetica-delta.vercel.app --json
```

---

## 📞 Contacto

**Dueño:** Carlos
**Cualquier ambigüedad:** Consultar con Carlos antes de asumir. Especialmente decisiones de arquitectura, modelo LLM, o flujo de onboarding.

---

## Historial de Cambios Recientes

- **26 May 2026**: Refactor tool calling con doble llamada al LLM
- **26 May 2026**: Añadida tool `mark_onboarding_complete`
- **26 May 2026**: Reglas estrictas de onboarding en system prompt
- **26 May 2026**: Multiline textarea para chat
- **26 May 2026**: Fix de SSE parsing con buffer
- **25 May 2026**: Eliminados redirects de onboarding para evitar loops
- **Pre-25 May 2026**: Implementación inicial de auth, chat, plan semanal
