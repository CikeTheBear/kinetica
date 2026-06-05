import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { advanceMesocycleWeek, regenerateCurrentMesocycleWeek } from '@/lib/mesocycle';

/**
 * Acciones sobre la semana del mesociclo activo.
 *  POST { action: 'advance' }    → genera la SIGUIENTE semana del bloque.
 *  POST { action: 'regenerate' } → regenera la semana EN CURSO (sin avanzar).
 */

const BodySchema = z.object({
  action: z.enum(['advance', 'regenerate']),
});

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Payload inválido', details: parsed.error.errors }, { status: 400 });
  }

  const result =
    parsed.data.action === 'advance'
      ? await advanceMesocycleWeek(user.id)
      : await regenerateCurrentMesocycleWeek(user.id);

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ plan: result.plan }, { headers: { 'Cache-Control': 'no-store' } });
}
