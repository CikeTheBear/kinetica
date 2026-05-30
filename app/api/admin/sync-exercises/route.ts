import { NextRequest } from 'next/server';
import { syncExercisesCache } from '@/lib/wger';

// La sincronización pagina sobre ~850 ejercicios; dale margen de tiempo.
export const maxDuration = 60;

/**
 * POST /api/admin/sync-exercises
 *
 * Endpoint protegido para poblar/refrescar exercises_cache desde wger.de.
 * Se protege con un secreto en el header Authorization (env SYNC_SECRET),
 * NO con la sesión de usuario: está pensado para llamarse a mano (curl) o
 * desde un cron, no desde la UI.
 *
 *   curl -X POST https://<host>/api/admin/sync-exercises \
 *        -H "Authorization: Bearer $SYNC_SECRET"
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SYNC_SECRET;
  const provided = request.headers.get('authorization');

  if (!secret || provided !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const result = await syncExercisesCache();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
