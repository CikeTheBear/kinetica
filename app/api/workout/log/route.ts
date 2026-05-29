import { createClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * API route: POST /api/workout/log
 * Persiste el entrenamiento ejecutado de un día ("En el Ruedo").
 *
 * Recibe los ejercicios del día con sus series registradas y escribe una fila
 * por ejercicio en workout_logs (las series van en la columna jsonb `sets`).
 *
 * Idempotencia: si el usuario ya había registrado ese día para ese plan,
 * borramos las filas previas (mismo user + plan + fecha) antes de insertar, de
 * modo que re-finalizar el entreno reemplace en vez de duplicar.
 */

const SerieSchema = z.object({
  serie: z.number().int().min(1),
  peso_kg: z.number().min(0),
  reps: z.number().int().min(0),
  completado: z.boolean(),
});

const EjercicioSchema = z.object({
  wger_id: z.number().int().positive(),
  nombre: z.string().min(1),
  series: z.array(SerieSchema),
});

const PayloadSchema = z.object({
  weekly_plan_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ejercicios: z.array(EjercicioSchema).min(1),
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

  // 2. Validar el cuerpo
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Payload inválido', details: parsed.error.errors },
      { status: 400 }
    );
  }

  const { weekly_plan_id, fecha, ejercicios } = parsed.data;

  // 3. Idempotencia: borrar logs previos de ese día/plan antes de reinsertar.
  await supabase
    .from('workout_logs')
    .delete()
    .eq('user_id', user.id)
    .eq('weekly_plan_id', weekly_plan_id)
    .eq('fecha', fecha);

  // 4. Una fila por ejercicio. Las series van en la columna jsonb `sets`.
  const rows = ejercicios.map((ej) => ({
    user_id: user.id,
    weekly_plan_id,
    fecha,
    ejercicio_wger_id: ej.wger_id,
    ejercicio_nombre: ej.nombre,
    sets: ej.series,
  }));

  const { error: insertError } = await supabase.from('workout_logs').insert(rows);

  if (insertError) {
    return Response.json(
      { error: `Error guardando el entrenamiento: ${insertError.message}` },
      { status: 500 }
    );
  }

  return Response.json(
    { success: true, registrados: rows.length },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
