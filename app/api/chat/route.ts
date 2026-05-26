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
  const [context, recentMessages, summaries] = await Promise.all([
    getUserContext(user.id),
    getRecentMessages(user.id, 20),
    getChatSummaries(user.id, 5),
  ]);

  // 5. Armar system prompt y mensajes
  const systemPrompt = buildSystemPrompt(context, summaries, isProactive);
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
  context: string,
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

  const summariesText =
    summaries.length > 0
      ? `\n\n# Notas previas\n${summaries.map((s) => s.resumen).join('\n')}`
      : '';

  const proactiveNote = isProactive
    ? '\n\n[Mensaje proactivo: inicia con propósito claro, sin saludos genéricos.]'
    : '';

  return `${basePrompt}\n\n${context}${summariesText}${proactiveNote}`;
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
 */
async function callOpenRouterStream(
  messages: { role: string; content: string }[],
  userId: string
): Promise<ReadableStream> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_DEFAULT_MODEL || 'anthropic/claude-3.5-sonnet';

  // Fallback si no hay API key configurada
  if (!apiKey) {
    return createErrorStream(
      'No está configurada la API key de OpenRouter. Kai no puede responder en este momento.'
    );
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
      tools: TOOLS,
      stream: true,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return createErrorStream(`Error conectando con el modelo: ${errorText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  let toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = [];

  return new ReadableStream({
    async start(controller) {
      let streamEnded = false;
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6);
            if (data === '[DONE]') {
              streamEnded = true;
              
              // Si hay tool calls pendientes, ejecutarlas
              if (toolCalls.length > 0) {
                for (const tc of toolCalls) {
                  try {
                    const args = JSON.parse(tc.function.arguments);
                    const result = await executeTool(tc.function.name, args, userId);
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({
                          tool_call: { name: tc.function.name, result },
                        })}\n\n`
                      )
                    );
                  } catch (e) {
                    console.error('Error ejecutando tool:', e);
                  }
                }
              }

              // Guardar mensaje del asistente en BD
              if (fullContent) {
                await saveAssistantMessage(userId, fullContent);
              }

              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
              controller.close();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              // Detectar tool calls
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
                continue;
              }

              const content = delta?.content || '';
              if (content) {
                fullContent += content;
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ content })}\n\n`
                  )
                );
              }
            } catch {
              // Ignorar JSON malformado
            }
          }
        }
        
        // Si el stream termina sin [DONE], enviar [DONE] de todos modos
        if (!streamEnded) {
          if (fullContent) {
            await saveAssistantMessage(userId, fullContent);
          }
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        }
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
    cancel() {
      reader.cancel();
    },
  });
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
