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
    default:
      return `Tool desconocida: ${toolName}`;
  }
}

import { createClient } from '@/lib/supabase/server';

async function updateUserProfile(
  args: { field: string; value: string },
  userId: string
): Promise<string> {
  const supabase = createClient();

  // Obtener perfil actual
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('metadata_biometrica')
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

  const { error } = await supabase
    .from('user_profiles')
    .update({ metadata_biometrica: metadata })
    .eq('id', userId);

  if (error) {
    return `Error actualizando perfil: ${error.message}`;
  }

  return `Perfil actualizado: ${args.field} = ${args.value}`;
}
