/**
 * Tool definitions para OpenRouter function calling.
 * Estos schemas se envían en cada request para que el LLM sepa qué puede hacer.
 */

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'update_user_profile',
      description:
        'Actualiza el perfil del usuario cuando revela nuevo dato relevante (objetivo cambió, equipamiento nuevo, lesión nueva, etc.).',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            description:
              'Campo a actualizar en metadata_biometrica (ej. "objetivo_principal", "nivel_experiencia", "equipamiento")',
          },
          value: {
            type: 'string',
            description: 'Nuevo valor para el campo. Para arrays, enviar como string JSON.',
          },
        },
        required: ['field', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_weekly_plan',
      description:
        'Genera un plan semanal completo de entrenamiento. Usar cuando el usuario pide un nuevo plan, al inicio de semana, o cuando hay cambios significativos.',
      parameters: {
        type: 'object',
        properties: {
          confirmacion: {
            type: 'boolean',
            description:
              'Debe ser true. El usuario debe confirmar explícitamente que quiere generar un nuevo plan.',
          },
        },
        required: ['confirmacion'],
      },
    },
  },
];

/**
 * Ejecuta una tool call y devuelve el resultado.
 */
export async function executeTool(
  toolName: string,
  args: unknown,
  userId: string
): Promise<string> {
  switch (toolName) {
    case 'update_user_profile': {
      const a = args as { field: string; value: string };
      return updateUserProfile(a, userId);
    }
    case 'generate_weekly_plan': {
      return generateWeeklyPlan(userId);
    }
    default:
      return `Tool desconocida: ${toolName}`;
  }
}

import { createClient } from '@/lib/supabase/server';
import { isOnboardingDataComplete } from '@/lib/onboarding';
import { generatePlanForUser } from '@/lib/plan';

async function updateUserProfile(
  args: { field: string; value: string },
  userId: string
): Promise<string> {
  const supabase = createClient();

  // Obtener perfil actual
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('metadata_biometrica, onboarding_completed')
    .eq('id', userId)
    .single();

  const metadata = profile?.metadata_biometrica || {};

  // Parsear value si es un array/object JSON
  let parsedValue: any = args.value;
  try {
    parsedValue = JSON.parse(args.value);
  } catch {
    // Si no es JSON, mantener como string
  }

  // Actualizar campo
  metadata[args.field] = parsedValue;

  // Reevaluar el onboarding de forma determinística (NO dependemos del LLM).
  // Si ya están los 5 datos y aún no estaba marcado, lo marcamos en el mismo UPDATE.
  const update: { metadata_biometrica: unknown; onboarding_completed?: boolean } = {
    metadata_biometrica: metadata,
  };
  const justCompleted =
    !profile?.onboarding_completed && isOnboardingDataComplete(metadata);
  if (justCompleted) {
    update.onboarding_completed = true;
  }

  const { error } = await supabase
    .from('user_profiles')
    .update(update)
    .eq('id', userId);

  if (error) {
    return `Error actualizando perfil: ${error.message}`;
  }

  if (justCompleted) {
    return `Perfil actualizado: ${args.field} = ${args.value}. Onboarding completado (todos los datos mínimos recopilados).`;
  }
  return `Perfil actualizado: ${args.field} = ${args.value}`;
}

async function generateWeeklyPlan(userId: string): Promise<string> {
  try {
    // Llamamos directamente a la función reutilizable con el userId que ya
    // tenemos. Antes esto hacía un fetch HTTP interno al endpoint /api/plan/generate,
    // lo cual estaba roto: apuntaba a NEXT_PUBLIC_APP_URL (producción) y no
    // reenviaba las cookies de sesión, así que el endpoint devolvía 401.
    const result = await generatePlanForUser(userId);

    if (!result.ok) {
      return `Error generando plan: ${result.error}`;
    }

    return `Plan semanal generado correctamente para la semana del ${result.plan.semana_inicio}.`;
  } catch (error) {
    return `Error generando plan: ${(error as Error).message}`;
  }
}
