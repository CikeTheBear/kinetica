import { createClient } from '@/lib/supabase/server';
import { generatePlanForUser } from '@/lib/plan';
import { NextRequest } from 'next/server';

/**
 * API route: POST /api/plan/generate
 * Genera un plan semanal de entrenamiento usando OpenRouter structured outputs.
 *
 * La lógica de generación vive en lib/plan.ts (generatePlanForUser) para poder
 * reutilizarse desde la tool del chat sin tener que hacer un fetch HTTP interno.
 * Este endpoint solo se encarga de la auth y de delegar.
 */
export async function POST(_request: NextRequest) {
  const supabase = createClient();

  // 1. Autenticación
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Delegar en la función reutilizable
  const result = await generatePlanForUser(user.id);

  if (!result.ok) {
    return Response.json(
      { error: result.error, details: result.details },
      { status: result.status }
    );
  }

  return Response.json({
    success: true,
    plan: result.plan,
    message: 'Plan semanal generado correctamente',
  });
}
