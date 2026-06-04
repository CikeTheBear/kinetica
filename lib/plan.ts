import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/memory';
import { getCatalogForUser } from '@/lib/wger';
import { getProgressionSummary } from '@/lib/progression';
import { z } from 'zod';

/**
 * Lógica reutilizable de generación de plan semanal.
 *
 * Esta función NO depende de la request HTTP ni de cookies: recibe el userId
 * directamente. Así puede invocarse tanto desde el endpoint POST /api/plan/generate
 * (que hace su auth y pasa user.id) como desde la tool generateWeeklyPlan
 * (que ya tiene el userId), sin tener que hacer un fetch interno que perdería la sesión.
 */

// ---------------------------------------------------------------------------
// Schemas Zod para validar el plan semanal generado por el LLM
// ---------------------------------------------------------------------------

const EjercicioSchema = z.object({
  wger_id: z.number().int().positive(),
  nombre: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  reps_objetivo: z.string().min(1),
  peso_sugerido_kg: z.number().optional(),
  rpe_objetivo: z.number().int().min(1).max(10).optional(),
  descanso_seg: z.number().int().min(0).optional(),
  notas_kai: z.string().optional(),
  // Superserie: ejercicios consecutivos con el mismo valor (una letra: "A",
  // "B"...) se ejecutan en ronda (A1→A2→...). Ausente = ejercicio individual.
  // Opcional y retrocompatible: los planes sin este campo siguen siendo válidos.
  grupo: z.string().max(3).optional(),
});

const DiaSchema = z.object({
  dia: z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']),
  tipo: z.string().min(1),
  es_descanso: z.boolean(),
  // min(0): un día de descanso tiene duración 0, que es válido (antes min(1)
  // rechazaba los planes porque el LLM ponía 0 en los días de descanso).
  duracion_estimada_min: z.number().int().min(0).max(300).optional(),
  ejercicios: z.array(EjercicioSchema),
});

export const PlanSemanalSchema = z.object({
  semana_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  notas_bloque: z.string().optional(),
  dias: z.array(DiaSchema).length(7),
});

export type PlanSemanal = z.infer<typeof PlanSemanalSchema>;

// Resultado discriminado: o bien tenemos éxito con el plan insertado en BD,
// o bien tenemos un error con un mensaje claro y un código HTTP sugerido.
// Esto evita lanzar excepciones: el caller decide cómo presentar el resultado.
export type GeneratePlanResult =
  | { ok: true; plan: any }
  | { ok: false; status: number; error: string; details?: unknown };

/**
 * Calcula el lunes de la semana que viene.
 *
 * Importante: trabajamos siempre con los componentes de fecha LOCALES.
 * Antes se usaba new Date() (local) pero se formateaba con toISOString() (UTC),
 * lo que en Caracas (GMT-4) cerca de medianoche calculaba mal el lunes
 * (la conversión a UTC podía saltar al día siguiente). Aquí construimos el
 * string YYYY-MM-DD manualmente a partir de getFullYear/getMonth/getDate,
 * que son consistentes con la zona horaria local del servidor.
 */
export function getNextMonday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);

  // Formatear como YYYY-MM-DD usando los componentes locales (no UTC).
  const year = nextMonday.getFullYear();
  const month = String(nextMonday.getMonth() + 1).padStart(2, '0');
  const day = String(nextMonday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Pausa simple para el backoff entre reintentos.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Llama a OpenRouter, parsea y valida el plan con Zod, con reintentos y backoff.
 * Devuelve el plan validado o null si tras todos los intentos no se obtuvo uno válido.
 */
async function generateAndValidatePlan(
  apiKey: string,
  model: string,
  systemPrompt: string,
  nextMonday: string,
  validWgerIds: Set<number>
): Promise<PlanSemanal | null> {
  const MAX_ATTEMPTS = 3;

  // El formato lo pedimos por PROMPT, no con response_format/json_schema.
  // Razón: OpenRouter enruta cada modelo a un proveedor distinto (Claude → Amazon
  // Bedrock) y cada uno soporta un subconjunto distinto de JSON Schema; Bedrock
  // rechaza con 400 constraints como minItems, minimum, maximum, etc. Pedir el JSON
  // por prompt + validar con Zod funciona con CUALQUIER modelo y no se rompe al
  // cambiar de modelo. Zod es la validación real de rangos/enums/longitud.
  const formatInstructions = `Responde EXCLUSIVAMENTE con un objeto JSON válido para la semana del ${nextMonday}. Sin texto adicional, sin explicaciones, sin bloques de código markdown. Estructura EXACTA:
{
  "semana_inicio": "${nextMonday}",
  "notas_bloque": "<lógica general del bloque de entrenamiento>",
  "dias": [
    // EXACTAMENTE 7 objetos, uno por día de lunes a domingo, en orden
    {
      "dia": "lunes|martes|miercoles|jueves|viernes|sabado|domingo",
      "tipo": "<Empuje|Pull|Piernas|Descanso|Full Body|...>",
      "es_descanso": false,
      "duracion_estimada_min": 60,
      "ejercicios": [
        // array vacío [] si es día de descanso
        {
          "wger_id": 123,
          "nombre": "<nombre del ejercicio en español>",
          "sets": 4,
          "reps_objetivo": "<ej. '6-8', '10', '12-15'>",
          "peso_sugerido_kg": 40,
          "rpe_objetivo": 8,
          "descanso_seg": 90,
          "notas_kai": "<notas técnicas o de ejecución>",
          "grupo": "A"
        }
      ]
    }
  ]
}
Restricciones: sets entre 1 y 10; rpe_objetivo entre 1 y 10; usa IDs reales de wger.de. El campo "grupo" es OPCIONAL (omítelo en ejercicios individuales); úsalo solo para superseries (ver regla 8).`;

  // Semilla de variación: se genera una por cada llamada (cada "Regenerar").
  // Cumple dos funciones:
  //  1. Hace que el cuerpo de la petición sea ÚNICO entre regeneraciones. Sin
  //     esto, dos clicks consecutivos mandaban una petición byte-idéntica y
  //     OpenRouter/Bedrock devolvía la MISMA completion (el plan no cambiaba: el
  //     bug que estamos cerrando). El nonce en el prompt + el seed rompen eso.
  //  2. Le indica al modelo de forma explícita que debe producir una rutina nueva.
  const variationSeed = Math.floor(Math.random() * 1_000_000_000);
  const variationInstruction = `\n\nVARIACIÓN (id ${variationSeed}): genera un plan NUEVO y DISTINTO a cualquier plan anterior. Varía la selección de ejercicios del catálogo, su orden y los esquemas de sets/reps. No repitas la misma combinación de ejercicios de otras semanas.`;
  const userContent = formatInstructions + variationInstruction;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
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
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          // 0.8: suficiente variedad entre regeneraciones sin que el plan se
          // vuelva incoherente. seed: varía la petición a nivel de proveedor.
          temperature: 0.8,
          seed: variationSeed,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '<sin cuerpo>');
        console.error(
          `[plan] OpenRouter respondió ${response.status} (intento ${attempt}/${MAX_ATTEMPTS}): ${errBody}`
        );
      } else {
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        const parsedPlan = typeof rawContent === 'string' ? extractJsonObject(rawContent) : rawContent;

        if (parsedPlan !== undefined) {
          const validationResult = PlanSemanalSchema.safeParse(parsedPlan);
          if (validationResult.success) {
            // Validación dura: todos los wger_id deben existir en el catálogo
            // que le pasamos. Cierra el agujero de que el LLM invente ejercicios.
            const inventados = validationResult.data.dias
              .flatMap((d) => d.ejercicios)
              .map((e) => e.wger_id)
              .filter((id) => !validWgerIds.has(id));

            if (inventados.length === 0) {
              return validationResult.data;
            }
            console.error(
              `[plan] El plan usa wger_id fuera del catálogo (intento ${attempt}/${MAX_ATTEMPTS}): ${inventados.join(', ')}`
            );
          } else {
            console.error(
              `[plan] Plan inválido contra el schema Zod (intento ${attempt}/${MAX_ATTEMPTS})`,
              validationResult.error.errors
            );
          }
        } else {
          console.error(
            `[plan] No se pudo extraer JSON de la respuesta (intento ${attempt}/${MAX_ATTEMPTS})`
          );
        }
      }
    } catch (error) {
      console.error(
        `[plan] Excepción llamando a OpenRouter (intento ${attempt}/${MAX_ATTEMPTS})`,
        error
      );
    }

    // Backoff incremental antes del siguiente intento (no tras el último).
    if (attempt < MAX_ATTEMPTS) {
      await sleep(attempt * 500);
    }
  }

  return null;
}

/**
 * Extrae un objeto JSON de la respuesta cruda del modelo de forma robusta.
 *
 * Como pedimos el JSON por prompt (sin response_format), el modelo a veces lo
 * envuelve en un bloque markdown (```json ... ```) o añade texto alrededor.
 * Esta función limpia esos casos: primero intenta parsear el contenido de un
 * fence markdown si existe, luego el texto tal cual, y como último recurso
 * extrae el substring entre la primera '{' y la última '}'.
 * Devuelve el objeto parseado o undefined si no hay JSON válido.
 */
function extractJsonObject(raw: string): unknown {
  const candidates: string[] = [];
  const trimmed = raw.trim();

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());

  candidates.push(trimmed);

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // probar el siguiente candidato
    }
  }
  return undefined;
}

/**
 * Genera y persiste el plan semanal para un usuario dado.
 *
 * Pasos:
 *  1. Validar onboarding del perfil.
 *  2. Calcular el próximo lunes.
 *  3. Comprobar que no exista ya un plan para esa semana.
 *  4. Construir el prompt con el contexto del usuario.
 *  5. Generar el plan con reintentos/backoff + validación Zod.
 *  6. Guardar en BD y archivar planes anteriores activos.
 */
export async function generatePlanForUser(userId: string): Promise<GeneratePlanResult> {
  const supabase = createClient();

  // 1. Obtener perfil para validar que onboarding esté completo
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_completed, metadata_biometrica, locale')
    .eq('id', userId)
    .single();

  if (!profile?.onboarding_completed) {
    return {
      ok: false,
      status: 403,
      error: 'Onboarding no completado. Completa tu perfil con Kai primero.',
    };
  }

  // 2. Calcular lunes de la semana que viene
  const nextMonday = getNextMonday();

  // (Regenerar es válido: si ya hay un plan para esta semana lo reemplazamos.
  // El borrado se hace MÁS ABAJO, solo cuando ya tenemos un plan nuevo válido,
  // para no dejar al usuario sin plan si la generación falla.)

  // 4. Construir contexto para el LLM. getUserContext devuelve un objeto;
  // aquí solo necesitamos el bloque de texto del contexto.
  const { context } = await getUserContext(userId);
  const locale = profile.locale || 'es';

  // 4a-bis. Resumen de rendimiento de la semana en curso (plan vs realidad +
  // RPE real). Es la señal que permite a Kai progresar la carga con datos.
  // null si es la primera semana o no hay entrenos registrados.
  const progresion = await getProgressionSummary(userId);
  const progresionBlock = progresion
    ? `\n${progresion}\n`
    : '\n(Sin datos de rendimiento de semanas anteriores: primera semana o sin entrenos registrados. Parte de pesos sugeridos normales para su nivel.)\n';

  // 4b. Cargar el catálogo de ejercicios accesible según el equipamiento del
  // usuario. El LLM elegirá SOLO de esta lista (con wger_id reales), de modo que
  // no pueda inventar ejercicios inexistentes. Esto requiere que exercises_cache
  // esté poblado (POST /api/admin/sync-exercises).
  const metadata = (profile.metadata_biometrica || {}) as Record<string, unknown>;
  const equipamiento = Array.isArray(metadata.equipamiento)
    ? (metadata.equipamiento as string[])
    : [];
  const catalogo = await getCatalogForUser(equipamiento);

  if (catalogo.length === 0) {
    return {
      ok: false,
      status: 503,
      error:
        'No hay ejercicios disponibles en el catálogo. ¿Se sincronizó exercises_cache con wger.de?',
    };
  }

  const validWgerIds = new Set(catalogo.map((c) => c.wger_id));
  const catalogoText = catalogo
    .map((c) => `${c.wger_id} | ${c.nombre}${c.grupo_muscular ? ` | ${c.grupo_muscular}` : ''}`)
    .join('\n');

  // 5. Config OpenRouter
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o';

  if (!apiKey) {
    return { ok: false, status: 500, error: 'OpenRouter API key no configurada' };
  }

  const systemPrompt = `Eres Kai, coach personal de Kinética. Genera un plan semanal de entrenamiento estructurado y preciso.

REGLAS CRÍTICAS:
1. Usa ÚNICAMENTE ejercicios del CATÁLOGO de abajo. Cada "wger_id" del plan DEBE ser uno de los IDs listados. NO inventes ejercicios ni IDs que no estén en el catálogo.
2. El plan debe cubrir exactamente 7 días (lunes a domingo).
3. Respeta lesiones activas: si el usuario reportó una lesión, NO incluyas ejercicios que la agraven.
4. Adapta volumen e intensidad al nivel de experiencia del usuario.
5. Incluye al menos 1-2 días de descanso activo o completo.
6. La duración estimada debe ser realista (45-90 min para días de gym).
7. PROGRESIÓN: aplica sobrecarga progresiva basándote en el RENDIMIENTO de la semana en curso (si aparece más abajo), ejercicio por ejercicio:
   - "sobró margen" (RPE real bastante por debajo del objetivo) → sube el peso ~2.5-5%; en ejercicios de peso corporal, añade 1-2 reps.
   - "al límite" (RPE real igual o por encima del objetivo, o cerca de 10) → mantén el peso o redúcelo ligeramente; prioriza técnica.
   - "en objetivo" → progresión ligera o mantener.
   - "sin RPE" → progresa con prudencia según si completó las series y reps planeadas.
   Explica brevemente en "notas_kai" el ajuste que hiciste respecto a la semana pasada. Si NO hay datos de rendimiento, parte de pesos sugeridos normales para su nivel.
8. SUPERSERIES (opcional): puedes agrupar 2-3 ejercicios CONSECUTIVOS en una superserie poniéndoles el mismo valor en "grupo" (una letra: "A", "B"...). El "grupo" es de SUPERSERIE, no tiene nada que ver con el grupo muscular del catálogo. Úsalo solo cuando aporte (antagonistas, eficiencia de tiempo); el "descanso_seg" de esos ejercicios se entiende TRAS completar la ronda del grupo. La mayoría de ejercicios deben ir SUELTOS (sin "grupo"). No abuses.

${context}
${progresionBlock}
=== CATÁLOGO DE EJERCICIOS DISPONIBLES (formato: wger_id | nombre | grupo muscular) ===
${catalogoText}
=== FIN DEL CATÁLOGO ===

Idioma del usuario: ${locale}. Genera todo el plan en ese idioma.`;

  // 6. Generar con reintentos + validación (Zod + wger_id dentro del catálogo)
  const validPlan = await generateAndValidatePlan(apiKey, model, systemPrompt, nextMonday, validWgerIds);

  if (!validPlan) {
    return {
      ok: false,
      status: 502,
      error:
        'No se pudo generar un plan válido tras varios intentos. Inténtalo de nuevo en unos momentos.',
    };
  }

  // 7. Guardar en BD. Si ya existía un plan para esta semana, lo borramos ahora
  // (ya tenemos uno nuevo válido) para liberar el UNIQUE(user_id, semana_inicio)
  // y permitir la regeneración sin dejar al usuario sin plan ante un fallo.
  await supabase
    .from('weekly_plans')
    .delete()
    .eq('user_id', userId)
    .eq('semana_inicio', nextMonday);

  const { data: insertedPlan, error: insertError } = await supabase
    .from('weekly_plans')
    .insert({
      user_id: userId,
      semana_inicio: validPlan.semana_inicio,
      estado: 'active',
      plan_json: validPlan,
      notas_bloque: validPlan.notas_bloque || null,
    })
    .select()
    .single();

  if (insertError) {
    return { ok: false, status: 500, error: `Error guardando plan: ${insertError.message}` };
  }

  // 8. Marcar planes anteriores como 'archived' si existen
  await supabase
    .from('weekly_plans')
    .update({ estado: 'archived' })
    .eq('user_id', userId)
    .neq('id', insertedPlan.id)
    .eq('estado', 'active');

  return { ok: true, plan: insertedPlan };
}
