import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getActiveMesocycle, startMesocycle } from '@/lib/mesocycle';

/**
 * API de mesociclos.
 *  GET  → devuelve el mesociclo activo del usuario (o null).
 *  POST → inicia un bloque nuevo y genera la semana 1.
 */

const StartSchema = z.object({
  nombre: z.string().max(80).optional(),
  objetivo: z.string().max(80).optional(),
  numSemanas: z.number().int().min(2).max(8).optional(),
});

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mesocycle = await getActiveMesocycle(user.id);
  return Response.json({ mesocycle }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // El cuerpo es opcional (se permite empezar un bloque con los valores por defecto).
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = StartSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return Response.json(
      { error: 'Payload inválido', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const result = await startMesocycle(user.id, parsed.data);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ plan: result.plan }, { headers: { 'Cache-Control': 'no-store' } });
}
