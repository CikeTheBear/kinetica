import { createClient } from '@/lib/supabase/server';
import { computeIMC } from '@/lib/biometrics';
import { getBiometricsHistory } from '@/lib/biometrics-server';
import { NextRequest } from 'next/server';
import { z } from 'zod';

/**
 * API route: registro biométrico MANUAL (pesaje + composición corporal).
 *
 * POST  → inserta un pesaje en biometrics_history (origen_datos = 'manual').
 *         Solo peso_kg es obligatorio; el resto de campos de composición son
 *         opcionales. Si no se pasa IMC pero sí altura en el perfil, lo calcula.
 * GET   → devuelve el historial reciente del usuario.
 *
 * Auth con el cliente de sesión (@/lib/supabase/server). La RLS de la tabla es
 * `FOR ALL USING (auth.uid() = user_id)`, así que el cliente de sesión puede
 * insertar y leer las filas propias sin necesidad del service_role.
 */

// Campos de composición opcionales. Rangos laxos pero defensivos: porcentajes
// 0–100, pesos/masas no negativos. Coinciden con las columnas numeric de la tabla.
const PayloadSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(), // si falta, se pone hoy en el server
  hora: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/)
    .optional(),
  peso_kg: z.number().positive(), // único obligatorio
  porcentaje_grasa: z.number().min(0).max(100).optional(),
  porcentaje_musculo: z.number().min(0).max(100).optional(),
  porcentaje_agua: z.number().min(0).max(100).optional(),
  porcentaje_proteina: z.number().min(0).max(100).optional(),
  masa_osea_kg: z.number().min(0).optional(),
  masa_libre_grasa_kg: z.number().min(0).optional(),
  masa_grasa_kg: z.number().min(0).optional(),
  grasa_visceral: z.number().min(0).optional(),
  metabolismo_basal_kcal: z.number().int().min(0).optional(),
  edad_metabolica: z.number().int().min(0).optional(),
  tipo_cuerpo: z.string().min(1).optional(),
});

/** Hoy como YYYY-MM-DD en componentes locales (evita off-by-one por UTC). */
function hoyLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

  const data = parsed.data;
  const fecha = data.fecha ?? hoyLocal();

  // 3. IMC: si el cliente no lo manda, intentamos calcularlo con la altura del
  //    perfil (metadata_biometrica.altura_cm). Si no hay altura, queda null.
  let imc: number | null = null;
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('metadata_biometrica')
    .eq('id', user.id)
    .single();

  const alturaCm = (profile?.metadata_biometrica as { altura_cm?: number } | null)
    ?.altura_cm;
  imc = computeIMC(data.peso_kg, typeof alturaCm === 'number' ? alturaCm : null);

  // 4. Insertar el pesaje. origen_datos = 'manual' (este endpoint es solo manual).
  const row = {
    user_id: user.id,
    fecha,
    hora: data.hora ?? null,
    peso_kg: data.peso_kg,
    imc,
    porcentaje_grasa: data.porcentaje_grasa ?? null,
    porcentaje_musculo: data.porcentaje_musculo ?? null,
    porcentaje_agua: data.porcentaje_agua ?? null,
    porcentaje_proteina: data.porcentaje_proteina ?? null,
    masa_osea_kg: data.masa_osea_kg ?? null,
    masa_libre_grasa_kg: data.masa_libre_grasa_kg ?? null,
    masa_grasa_kg: data.masa_grasa_kg ?? null,
    grasa_visceral: data.grasa_visceral ?? null,
    metabolismo_basal_kcal: data.metabolismo_basal_kcal ?? null,
    edad_metabolica: data.edad_metabolica ?? null,
    tipo_cuerpo: data.tipo_cuerpo ?? null,
    origen_datos: 'manual',
  };

  // upsert sobre la UNIQUE (user_id, fecha, hora, origen_datos): re-registrar el
  // mismo momento reemplaza en vez de fallar por conflicto.
  const { data: inserted, error: insertError } = await supabase
    .from('biometrics_history')
    .upsert(row, { onConflict: 'user_id,fecha,hora,origen_datos' })
    .select('id')
    .single();

  if (insertError) {
    return Response.json(
      { error: `Error guardando el pesaje: ${insertError.message}` },
      { status: 500 }
    );
  }

  return Response.json(
    { success: true, id: inserted?.id, imc },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entries = await getBiometricsHistory(user.id);

  return Response.json(
    { entries },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
