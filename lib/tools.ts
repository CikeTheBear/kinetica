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
  {
    type: 'function',
    function: {
      name: 'query_progress_summary',
      description:
        'Consulta un resumen del progreso de entrenamiento del usuario (entrenos registrados, volumen total levantado, racha de semanas y frecuencia semanal). Úsalo cuando el usuario pregunte cómo va, su progreso, su volumen, su constancia o quiera feedback sobre sus entrenos.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_injury',
      description:
        'Registra una lesión o limitación activa del usuario. Úsalo cuando el usuario mencione una molestia, dolor o lesión que deba tenerse en cuenta al entrenar.',
      parameters: {
        type: 'object',
        properties: {
          zona: {
            type: 'string',
            description:
              'Zona del cuerpo afectada, ej. "hombro derecho", "lumbar", "rodilla izquierda".',
          },
          nota: {
            type: 'string',
            description:
              'Detalle opcional: tipo de molestia, contexto, o qué movimientos la agravan.',
          },
          severidad: {
            type: 'string',
            description: 'Severidad opcional. Una de: "leve", "moderada", "alta".',
          },
        },
        required: ['zona'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resolve_injury',
      description:
        'Marca una lesión activa como resuelta y la quita de las limitaciones del usuario. Úsalo cuando el usuario confirme que una lesión ya está recuperada o ya no le molesta.',
      parameters: {
        type: 'object',
        properties: {
          zona: {
            type: 'string',
            description:
              'Zona de la lesión a resolver. Puede coincidir parcialmente con una lesión activa, ej. "hombro" resolvería "hombro derecho".',
          },
        },
        required: ['zona'],
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
    case 'query_progress_summary': {
      return queryProgressSummary(userId);
    }
    case 'register_injury': {
      const a = args as { zona: string; nota?: string; severidad?: string };
      return registerInjury(a, userId);
    }
    case 'resolve_injury': {
      const a = args as { zona: string };
      return resolveInjury(a, userId);
    }
    default:
      return `Tool desconocida: ${toolName}`;
  }
}

import { createClient } from '@/lib/supabase/server';
import { isOnboardingDataComplete } from '@/lib/onboarding';
import { generatePlanForUser } from '@/lib/plan';
import {
  computeProgress,
  formatProgressSummary,
  type WorkoutLogRow,
} from '@/lib/progress';

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

/** Fecha de hoy como YYYY-MM-DD en componentes locales. */
function hoyISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function queryProgressSummary(userId: string): Promise<string> {
  const supabase = createClient();

  // Locale del usuario para que el resumen vaya en su idioma.
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('locale')
    .eq('id', userId)
    .single();

  const { data: logs } = await supabase
    .from('workout_logs')
    .select('fecha, ejercicio_nombre, sets')
    .eq('user_id', userId);

  const rows = (logs ?? []) as WorkoutLogRow[];
  const data = computeProgress(rows);
  return formatProgressSummary(data, profile?.locale || 'es');
}

async function registerInjury(
  args: { zona: string; nota?: string; severidad?: string },
  userId: string
): Promise<string> {
  const supabase = createClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('metadata_biometrica')
    .eq('id', userId)
    .single();

  const metadata = (profile?.metadata_biometrica || {}) as Record<string, unknown>;
  const lesiones = Array.isArray(metadata.lesiones_activas)
    ? [...(metadata.lesiones_activas as unknown[])]
    : [];

  lesiones.push({
    zona: args.zona,
    nota: args.nota || null,
    severidad: args.severidad || null,
    desde: hoyISO(),
  });
  metadata.lesiones_activas = lesiones;

  const { error } = await supabase
    .from('user_profiles')
    .update({ metadata_biometrica: metadata })
    .eq('id', userId);

  if (error) {
    return `Error registrando la lesión: ${error.message}`;
  }

  return `Lesión registrada y activa: ${args.zona}. Se tendrá en cuenta al generar o ajustar el plan. Puedes ofrecer al usuario regenerar su plan para adaptarlo a esta limitación.`;
}

async function resolveInjury(
  args: { zona: string },
  userId: string
): Promise<string> {
  const supabase = createClient();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('metadata_biometrica')
    .eq('id', userId)
    .single();

  const metadata = (profile?.metadata_biometrica || {}) as Record<string, unknown>;
  const lesiones = Array.isArray(metadata.lesiones_activas)
    ? (metadata.lesiones_activas as unknown[])
    : [];

  // Match flexible por zona: tolera entradas como string (de onboarding) o como
  // objeto { zona, ... } (las que escribe register_injury).
  const zonaBuscada = args.zona.toLowerCase();
  const restantes = lesiones.filter((l) => {
    const zona =
      typeof l === 'string'
        ? l
        : ((l as { zona?: string })?.zona ?? '');
    return !zona.toLowerCase().includes(zonaBuscada);
  });

  if (restantes.length === lesiones.length) {
    return `No encontré ninguna lesión activa que coincida con "${args.zona}". Lesiones activas actuales: ${JSON.stringify(lesiones)}`;
  }

  metadata.lesiones_activas = restantes;

  const { error } = await supabase
    .from('user_profiles')
    .update({ metadata_biometrica: metadata })
    .eq('id', userId);

  if (error) {
    return `Error resolviendo la lesión: ${error.message}`;
  }

  return `Lesión resuelta y quitada de las limitaciones: ${args.zona}. Si el usuario quiere, puedes ofrecer regenerar el plan ahora que esa restricción ya no aplica.`;
}
