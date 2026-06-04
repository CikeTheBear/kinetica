import { createClient } from '@/lib/supabase/server';
import { getExerciseRecords } from '@/lib/records';

/**
 * API route: GET /api/progress/records
 * Devuelve los récords e historial por ejercicio del usuario autenticado.
 *
 * Auth con el session client (mismo patrón que /api/workout/log). `no-store`
 * porque son datos personales y cambian con cada entreno: no queremos que se
 * cacheen en el navegador ni en intermediarios.
 */
export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const records = await getExerciseRecords(user.id);

  return Response.json({ records }, { headers: { 'Cache-Control': 'no-store' } });
}
