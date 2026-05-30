import { createClient } from '@/lib/supabase/server';
import { getUserContext, getRecentMessages, getChatSummaries } from '@/lib/memory';
import { TOOLS, executeTool } from '@/lib/tools';
import { NextRequest } from 'next/server';

/**
 * API route: POST /api/chat
 * Recibe un mensaje del usuario, construye el contexto completo de Kai
 * (Capas 1, 2, 3), llama a OpenRouter con SSE, y transmite la respuesta
 * al cliente token por token.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient();

  // 1. Autenticación
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Leer el mensaje del usuario
  const { message, isProactive } = await request.json();
  if (!message || typeof message !== 'string') {
    return new Response('Bad request: message required', { status: 400 });
  }

  // 3. Guardar mensaje del usuario en BD
  await supabase.from('chat_messages').insert({
    user_id: user.id,
    role: 'user',
    content: message,
  });

  // 4. Construir memoria (Capas 1, 2, 3)
  const [userContext, recentMessages, summaries] = await Promise.all([
    getUserContext(user.id),
    getRecentMessages(user.id, 20),
    getChatSummaries(user.id, 5),
  ]);

  // 5. Armar system prompt y mensajes
  const systemPrompt = buildSystemPrompt(userContext, summaries, isProactive);
  const messages = buildMessagesArray(systemPrompt, recentMessages, message);

  // 6. Llamar a OpenRouter
  const stream = await callOpenRouterStream(messages, user.id);

  // 7. Transmitir como SSE
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

function buildSystemPrompt(
  userContext: { context: string; onboardingCompleted: boolean; hasProfile: boolean },
  summaries: { resumen: string }[],
  isProactive?: boolean
) {
  const basePrompt = `Eres Kai, coach personal de la app Kinética.

# Personalidad (3 pilares iguales)
1. Científico técnico: fisiología, biomecánica, periodización.
2. Mentor empático: longevidad, salud articular, sostenibilidad.
3. Sargento disciplinado: constancia, trabajo duro, sin excusas baratas.

# Estilo
- Español neutro moderno.
- Términos técnicos en inglés: RPE, deload, AMRAP, Zone 2.
- Corto por defecto (2-4 oraciones).
- En gimnasio: telegráfico.
- Sin emojis decorativos.

# Lo que NUNCA haces
- Diagnosticar, prescribir, comparar con otros usuarios, spamear.

# Tools disponibles
Tienes acceso a funciones para actuar sobre la BD. Confirma antes de ejecutar tools importantes. Explica lo que hiciste después.`;

  // El bloque de onboarding se incluye SOLO si aún no está completo. Antes se
  // inyectaba siempre y el modelo, viendo "recopila estos 5 datos", reiniciaba
  // el onboarding aunque el usuario ya lo hubiera terminado. Ahora el estado
  // decide qué instrucciones recibe Kai (recopilar vs. actuar como coach).
  const onboardingBlock = userContext.onboardingCompleted
    ? `

# Estado del onboarding
- El usuario YA completó el onboarding. Sus datos están en el contexto de abajo.
- NUNCA vuelvas a pedirle objetivo, edad, peso, altura, disponibilidad, equipamiento ni lesiones: ya los tienes.
- Actúa como su coach: resuelve dudas, ajusta entrenamientos, motiva y, si lo pide, genera o modifica su plan.
- Si el usuario pide generar su plan, llama 'generate_weekly_plan' con confirmacion = true.
- Si pregunta por su progreso, volumen, racha o constancia, llama 'query_progress_summary' y coméntale los datos REALES que devuelve (no inventes cifras). Si aún no tiene entrenos registrados, anímale a registrar el primero.
- Si menciona una molestia, dolor o lesión nueva, llama 'register_injury' con la zona afectada. Después ofrécele regenerar el plan para adaptarlo a esa limitación.
- Si confirma que una lesión ya está recuperada, llama 'resolve_injury' con la zona.`
    : `

# Reglas de Onboarding
- Recopila conversacionalmente estos 5 datos: 1) objetivo, 2) datos basicos (edad, altura, peso), 3) disponibilidad (dias por semana), 4) equipamiento, 5) lesiones/limitaciones.
- Guarda CADA dato en cuanto lo tengas con la tool 'update_user_profile', usando EXACTAMENTE estos nombres de campo (schema canonico):
  - objetivo_principal: uno de [fuerza, hipertrofia, perdida_grasa, salud_general, rendimiento_deportivo, recomposicion]
  - edad: numero · altura_cm: numero · peso_inicial_kg: numero
  - dias_disponibles: numero
  - equipamiento: array JSON, ej. ["gimnasio_comercial"]
  - lesiones_activas: array JSON. Si el usuario confirma que NO tiene lesiones, guardalo como array vacio: []
- El sistema detecta y marca el onboarding como completado AUTOMATICAMENTE cuando estos datos esten guardados. NO tienes que marcarlo tu, ni anunciar que lo marcas.
- Si el usuario pide generar su plan, llama 'generate_weekly_plan' con confirmacion = true.`;

  const summariesText =
    summaries.length > 0
      ? `\n\n# Notas previas\n${summaries.map((s) => s.resumen).join('\n')}`
      : '';

  const proactiveNote = isProactive
    ? '\n\n[Mensaje proactivo: inicia con propósito claro, sin saludos genéricos.]'
    : '';

  return `${basePrompt}${onboardingBlock}\n\n${userContext.context}${summariesText}${proactiveNote}`;
}

function buildMessagesArray(
  systemPrompt: string,
  recentMessages: { role: string; content: string }[],
  userMessage: string
) {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of recentMessages) {
    if (msg.role === 'user' && msg.content === userMessage) continue;
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: userMessage });

  return messages;
}

/**
 * Llama a OpenRouter con soporte para tools y streaming.
 * Si el modelo hace tool calls, ejecuta las tools y hace una segunda llamada
 * con los resultados para obtener la respuesta final.
 */
async function callOpenRouterStream(
  messages: { role: string; content: string }[],
  userId: string
): Promise<ReadableStream> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-haiku-4.5';

  // Fallback si no hay API key configurada
  if (!apiKey) {
    return createErrorStream(
      'No está configurada la API key de OpenRouter. Kai no puede responder en este momento.'
    );
  }

  // Primera llamada: puede incluir tool calls
  const firstResponse = await fetchOpenRouter(messages, apiKey, model, true);
  if (!firstResponse.ok) {
    const errorText = await firstResponse.text();
    return createErrorStream(`Error conectando con el modelo: ${errorText}`);
  }

  return new ReadableStream({
    async start(controller) {
      try {
        const result = await processOpenRouterStream(
          firstResponse,
          controller,
          apiKey,
          model,
          messages,
          userId
        );

        // Si hubo tool calls, hacer segunda llamada con resultados
        if (result.toolCalls.length > 0) {
          const toolResults = [];
          for (const tc of result.toolCalls) {
            try {
              const args = JSON.parse(tc.function.arguments);
              const toolResult = await executeTool(tc.function.name, args, userId);
              toolResults.push({
                tool_call_id: tc.id,
                role: 'tool',
                name: tc.function.name,
                content: toolResult,
              });
            } catch (e) {
              console.error('Error ejecutando tool:', e);
              toolResults.push({
                tool_call_id: tc.id,
                role: 'tool',
                name: tc.function.name,
                content: `Error: ${(e as Error).message}`,
              });
            }
          }

          // Construir mensajes para segunda llamada
          const secondMessages = [
            ...messages,
            {
              role: 'assistant',
              content: result.fullContent || '',
              tool_calls: result.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.function.name,
                  arguments: tc.function.arguments,
                },
              })),
            },
            ...toolResults,
          ];

          // Segunda llamada sin tools (ya se ejecutaron). Aquí llega la respuesta
          // "real" que ve el usuario (diagnóstico, confirmación, etc.).
          const secondResponse = await fetchOpenRouter(secondMessages, apiKey, model, false);
          if (secondResponse.ok) {
            const second = await processOpenRouterStream(
              secondResponse, controller, apiKey, model, secondMessages, userId, true
            );
            // CLAVE: guardamos el contenido REAL que vio el usuario (texto previo a
            // las tools + respuesta final), NO un placeholder. Guardar el placeholder
            // corrompía el historial y hacía que Kai reiniciara el onboarding.
            const finalContent = [result.fullContent, second.fullContent]
              .filter(Boolean)
              .join('\n\n')
              .trim();
            if (finalContent) {
              await saveAssistantMessage(userId, finalContent);
            }
          } else {
            const fallbackMsg = 'He actualizado tu perfil. ¿Quieres que continúe?';
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ content: fallbackMsg })}\n\n`)
            );
            await saveAssistantMessage(userId, fallbackMsg);
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          }
        } else {
          // No hubo tool calls, guardar mensaje normal
          if (result.fullContent) {
            await saveAssistantMessage(userId, result.fullContent);
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        }

        controller.close();
      } catch (error) {
        console.error('Error en stream de OpenRouter:', error);
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ content: 'Error en el servidor. Por favor, inténtalo de nuevo.' })}\n\n`
          )
        );
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });
}

async function fetchOpenRouter(
  messages: unknown[],
  apiKey: string,
  model: string,
  includeTools: boolean
) {
  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'Kinética',
    },
    body: JSON.stringify({
      model,
      messages,
      ...(includeTools ? { tools: TOOLS } : {}),
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });
}

async function processOpenRouterStream(
  response: Response,
  controller: ReadableStreamDefaultController,
  apiKey: string,
  model: string,
  messages: unknown[],
  userId: string,
  isSecondCall = false
): Promise<{ fullContent: string; toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];

  // Buffer para acumular datos entre lecturas del reader. OpenRouter puede partir
  // una línea SSE (`data: {...}`) entre dos chunks de red; sin este buffer, la línea
  // partida se parsea mal, el JSON.parse falla y se pierde el fragmento (incluido un
  // tool_call o el propio [DONE]), dejando el stream colgado.
  let buffer = '';

  // Procesa una línea SSE ya completa. Devuelve true si era el marcador [DONE].
  const handleLine = (rawLine: string): boolean => {
    const line = rawLine.replace(/\r$/, ''); // tolerar terminadores \r\n
    if (!line.startsWith('data: ')) return false;

    const data = line.slice(6);
    if (data === '[DONE]') return true;

    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;

      // Detectar tool calls (pueden llegar fragmentados a lo largo de varios deltas)
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            toolCalls.push({
              id: tc.id,
              function: {
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              },
            });
          } else if (tc.function?.arguments) {
            const existing = toolCalls[toolCalls.length - 1];
            if (existing) {
              existing.function.arguments += tc.function.arguments;
            }
          }
        }
        return false;
      }

      const content = delta?.content || '';
      if (content) {
        fullContent += content;
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ content })}\n\n`)
        );
      }
    } catch {
      // Ignorar JSON malformado (no debería ocurrir ya con el buffer, pero por si acaso)
    }
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // La última línea puede estar incompleta: la guardamos para el próximo chunk.
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (handleLine(line)) {
          reader.releaseLock();
          return { fullContent, toolCalls };
        }
      }
    }

    // Procesar lo que quede en el buffer al cerrarse el stream (última línea sin \n).
    if (buffer) handleLine(buffer);

    reader.releaseLock();
    return { fullContent, toolCalls };
  } catch (error) {
    reader.releaseLock();
    throw error;
  }
}

function createErrorStream(message: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          `data: ${JSON.stringify({ content: message })}\n\n`
        )
      );
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

async function saveAssistantMessage(userId: string, content: string) {
  try {
    const supabase = createClient();
    const { error } = await supabase.from('chat_messages').insert({
      user_id: userId,
      role: 'assistant',
      content,
    });
    if (error) {
      console.error('Error guardando mensaje del asistente en BD:', error);
    }
  } catch (error) {
    console.error('Error guardando mensaje del asistente:', error);
  }
}
