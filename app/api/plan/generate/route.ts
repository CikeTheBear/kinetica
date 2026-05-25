import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/memory';
import { z } from 'zod';
import { NextRequest } from 'next/server';

/**
 * API route: POST /api/plan/generate
 * Genera un plan semanal de entrenamiento usando OpenRouter structured outputs.
 * Valida el JSON con Zod antes de guardar en BD.
 */

// Schema Zod para validar el plan semanal generado por el LLM
const EjercicioSchema = z.object({
  wger_id: z.number().int().positive(),
  nombre: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  reps_objetivo: z.string().min(1),
  peso_sugerido_kg: z.number().optional(),
  rpe_objetivo: z.number().int().min(1).max(10).optional(),
  descanso_seg: z.number().int().min(0).optional(),
  notas_kai: z.string().optional(),
});

const DiaSchema = z.object({
  dia: z.enum(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']),
  tipo: z.string().min(1),
  es_descanso: z.boolean(),
  duracion_estimada_min: z.number().int().min(1).max(300).optional(),
  ejercicios: z.array(EjercicioSchema),
});

const PlanSemanalSchema = z.object({
  semana_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  notas_bloque: z.string().optional(),
  dias: z.array(DiaSchema).length(7),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();

  // 1. Autenticación
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Obtener perfil para validar que onboarding esté completo
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('onboarding_completed, metadata_biometrica, locale')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed) {
    return Response.json(
      { error: 'Onboarding no completado. Completa tu perfil con Kai primero.' },
      { status: 403 }
    );
  }

  // 3. Calcular lunes de la semana que viene
  const nextMonday = getNextMonday();

  // 4. Verificar que no haya ya un plan para esa semana
  const { data: existingPlan } = await supabase
    .from('weekly_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('semana_inicio', nextMonday)
    .maybeSingle();

  if (existingPlan) {
    return Response.json(
      { error: 'Ya existe un plan para la semana del ' + nextMonday },
      { status: 409 }
    );
  }

  // 5. Construir contexto para el LLM
  const context = await getUserContext(user.id);
  const locale = profile.locale || 'es';

  // 6. Definir JSON schema para OpenRouter structured outputs
  const jsonSchema = {
    name: 'plan_semanal',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        semana_inicio: {
          type: 'string',
          description: `Fecha de inicio de la semana (lunes). Formato: YYYY-MM-DD. Debe ser: ${nextMonday}`,
        },
        notas_bloque: {
          type: 'string',
          description: 'Notas generales del bloque de entrenamiento. Explica la lógica del plan.',
        },
        dias: {
          type: 'array',
          minItems: 7,
          maxItems: 7,
          items: {
            type: 'object',
            properties: {
              dia: {
                type: 'string',
                enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'],
              },
              tipo: { type: 'string', description: 'Tipo de sesión: Empuje, Pull, Piernas, Descanso, Full Body, etc.' },
              es_descanso: { type: 'boolean' },
              duracion_estimada_min: { type: 'integer', description: 'Duración estimada en minutos' },
              ejercicios: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    wger_id: { type: 'integer', description: 'ID del ejercicio en wger.de' },
                    nombre: { type: 'string', description: 'Nombre del ejercicio en español' },
                    sets: { type: 'integer', minimum: 1, maximum: 10 },
                    reps_objetivo: { type: 'string', description: 'Ej: "6-8", "10", "12-15"' },
                    peso_sugerido_kg: { type: 'number' },
                    rpe_objetivo: { type: 'integer', minimum: 1, maximum: 10 },
                    descanso_seg: { type: 'integer', description: 'Segundos de descanso entre sets' },
                    notas_kai: { type: 'string', description: 'Notas técnicas o de ejecución' },
                  },
                  required: ['wger_id', 'nombre', 'sets', 'reps_objetivo'],
                },
              },
            },
            required: ['dia', 'tipo', 'es_descanso', 'ejercicios'],
          },
        },
      },
      required: ['semana_inicio', 'dias'],
    },
  };

  // 7. Llamar a OpenRouter con structured output
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o';

  if (!apiKey) {
    return Response.json({ error: 'OpenRouter API key no configurada' }, { status: 500 });
  }

  const systemPrompt = `Eres Kai, coach personal de Kinética. Genera un plan semanal de entrenamiento estructurado y preciso.

REGLAS CRÍTICAS:
1. Usa SOLO ejercicios que existan en wger.de (IDs reales).
2. El plan debe cubrir exactamente 7 días (lunes a domingo).
3. Respeta lesiones activas: si el usuario reportó una lesión, NO incluyas ejercicios que la agraven.
4. Adapta volumen e intensidad al nivel de experiencia del usuario.
5. Incluye al menos 1-2 días de descanso activo o completo.
6. La duración estimada debe ser realista (45-90 min para días de gym).

${context}

Idioma del usuario: ${locale}. Genera todo el plan en ese idioma.`;

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
          {
            role: 'user',
            content: `Genera mi plan semanal de entrenamiento para la semana del ${nextMonday}. Incluye ejercicios específicos con IDs de wger.de, sets, reps y descansos.`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: jsonSchema,
        },
        temperature: 0.5,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json(
        { error: `Error de OpenRouter: ${errorText}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const planJson = data.choices?.[0]?.message?.content;

    if (!planJson) {
      return Response.json({ error: 'OpenRouter no devolvió un plan' }, { status: 502 });
    }

    // 8. Parsear y validar con Zod
    let parsedPlan: any;
    try {
      parsedPlan = typeof planJson === 'string' ? JSON.parse(planJson) : planJson;
    } catch {
      return Response.json(
        { error: 'OpenRouter devolvió JSON inválido', raw: planJson },
        { status: 502 }
      );
    }

    const validationResult = PlanSemanalSchema.safeParse(parsedPlan);

    if (!validationResult.success) {
      return Response.json(
        {
          error: 'El plan generado no cumple el schema requerido',
          details: validationResult.error.errors,
          raw: parsedPlan,
        },
        { status: 422 }
      );
    }

    const validPlan = validationResult.data;

    // 9. Guardar en BD
    const { data: insertedPlan, error: insertError } = await supabase
      .from('weekly_plans')
      .insert({
        user_id: user.id,
        semana_inicio: validPlan.semana_inicio,
        estado: 'active',
        plan_json: validPlan,
        notas_bloque: validPlan.notas_bloque || null,
      })
      .select()
      .single();

    if (insertError) {
      return Response.json(
        { error: `Error guardando plan: ${insertError.message}` },
        { status: 500 }
      );
    }

    // 10. Marcar planes anteriores como 'archived' si existen
    await supabase
      .from('weekly_plans')
      .update({ estado: 'archived' })
      .eq('user_id', user.id)
      .neq('id', insertedPlan.id)
      .eq('estado', 'active');

    return Response.json({
      success: true,
      plan: insertedPlan,
      message: 'Plan semanal generado correctamente',
    });
  } catch (error) {
    console.error('Error generando plan:', error);
    return Response.json(
      { error: 'Error interno generando el plan' },
      { status: 500 }
    );
  }
}

/**
 * Calcula el lunes de la semana que viene.
 */
function getNextMonday(): string {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = domingo, 1 = lunes, ..., 6 = sábado
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;

  const nextMonday = new Date(today);
  nextMonday.setDate(today.getDate() + daysUntilNextMonday);

  // Formatear como YYYY-MM-DD
  return nextMonday.toISOString().split('T')[0];
}
