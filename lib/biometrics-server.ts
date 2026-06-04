/**
 * Wrapper de BD del registro biométrico (server-only).
 *
 * Importa lib/supabase/server (que usa next/headers), así que SOLO puede usarse
 * desde Server Components, API routes o Server Actions. La lógica pura vive en
 * lib/biometrics.ts para poder usarse también en el cliente y en tests.
 */

import { createClient } from '@/lib/supabase/server';
import type { BiometricEntry } from '@/lib/biometrics';

/**
 * Trae el historial biométrico del usuario, más reciente primero. Usa el cliente
 * de sesión (RLS `auth.uid() = user_id` permite leer lo propio).
 *
 * @param limit  cuántos pesajes recientes traer (por defecto 60, suficiente para
 *               un par de meses de pesajes diarios sin saturar la gráfica).
 */
export async function getBiometricsHistory(
  userId: string,
  limit = 60
): Promise<BiometricEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('biometrics_history')
    .select('fecha, peso_kg, imc, porcentaje_grasa, porcentaje_musculo')
    .eq('user_id', userId)
    .order('fecha', { ascending: false })
    .order('hora', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error || !data) {
    return [];
  }

  // Supabase devuelve numeric como string a veces; normalizamos a number | null.
  return data.map((row) => ({
    fecha: row.fecha as string,
    peso_kg: toNum(row.peso_kg),
    imc: toNum(row.imc),
    porcentaje_grasa: toNum(row.porcentaje_grasa),
    porcentaje_musculo: toNum(row.porcentaje_musculo),
  }));
}

/** Convierte un valor de Postgres numeric (string | number | null) a number | null. */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
