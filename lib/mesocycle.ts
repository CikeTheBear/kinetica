import { createClient } from '@/lib/supabase/server';
import {
  generatePlanForUser,
  getNextMonday,
  type GeneratePlanResult,
  type MesocycleContext,
} from '@/lib/plan';

/**
 * Orquestación de MESOCICLOS (Fase 2 del plan-model v2).
 *
 * Un mesociclo es un bloque de N semanas con un arco de progresión + una semana
 * de descarga (deload) al final. La semana sigue siendo la unidad atómica
 * (weekly_plans); aquí solo decidimos QUÉ semana del bloque generar y con qué
 * contexto, y delegamos la generación real en generatePlanForUser.
 *
 * Las semanas se materializan de UNA EN UNA al avanzar, de modo que cada semana
 * se genere con el RPE real de la anterior (loop de progresión) + el contexto
 * del bloque. Es opt-in: la generación de semana suelta (sin mesociclo) sigue
 * intacta.
 */

// Rango razonable de longitud de bloque. Fuera de esto no tiene sentido.
const MIN_SEMANAS = 2;
const MAX_SEMANAS = 8;
const DEFAULT_SEMANAS = 4;

export interface Mesocycle {
  id: string;
  user_id: string;
  nombre: string;
  objetivo: string | null;
  num_semanas: number;
  semana_actual: number;
  semana_inicio: string; // YYYY-MM-DD (lunes de la semana 1)
  estado: string;
  notas_bloque: string | null;
}

/**
 * Suma `weeks` semanas a una fecha YYYY-MM-DD usando componentes LOCALES
 * (evita el off-by-one por conversión a UTC en GMT-4, igual que getNextMonday).
 */
export function addWeeks(dateStr: string, weeks: number): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + weeks * 7);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Una semana es de descarga si es la última del bloque (y el bloque tiene ≥2). */
export function isDeloadWeek(semana: number, numSemanas: number): boolean {
  return numSemanas >= 2 && semana === numSemanas;
}

/** Devuelve el mesociclo activo del usuario, o null si no hay ninguno. */
export async function getActiveMesocycle(userId: string): Promise<Mesocycle | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('mesocycles')
    .select('*')
    .eq('user_id', userId)
    .eq('estado', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return (data as Mesocycle) ?? null;
}

/**
 * Inicia un mesociclo: crea la fila del bloque y genera la SEMANA 1.
 * Si la generación de la semana 1 falla, revierte (borra el bloque) para no
 * dejar un mesociclo vacío.
 */
export async function startMesocycle(
  userId: string,
  opts: { nombre?: string; objetivo?: string; numSemanas?: number }
): Promise<GeneratePlanResult> {
  const supabase = createClient();

  const numSemanas = Math.min(
    MAX_SEMANAS,
    Math.max(MIN_SEMANAS, opts.numSemanas ?? DEFAULT_SEMANAS)
  );
  const objetivo = opts.objetivo?.trim() || undefined;
  const nombre = opts.nombre?.trim() || `Bloque de ${numSemanas} semanas`;
  const semanaInicio = getNextMonday();

  const notasBloque = `Bloque de ${numSemanas} semanas${
    objetivo ? ` orientado a ${objetivo}` : ''
  }: acumulación progresiva en las semanas 1-${numSemanas - 1} (subiendo carga/volumen según el rendimiento real), y descarga (deload) en la semana ${numSemanas} para recuperar y consolidar.`;

  // Archivar cualquier bloque activo previo antes de abrir el nuevo.
  await supabase
    .from('mesocycles')
    .update({ estado: 'archived' })
    .eq('user_id', userId)
    .eq('estado', 'active');

  const { data: meso, error: insertError } = await supabase
    .from('mesocycles')
    .insert({
      user_id: userId,
      nombre,
      objetivo: objetivo ?? null,
      num_semanas: numSemanas,
      semana_actual: 1,
      semana_inicio: semanaInicio,
      estado: 'active',
      notas_bloque: notasBloque,
    })
    .select()
    .single();

  if (insertError || !meso) {
    return { ok: false, status: 500, error: `Error creando el mesociclo: ${insertError?.message}` };
  }

  // Generar la semana 1 del bloque.
  const ctx: MesocycleContext = {
    mesocycleId: meso.id,
    nombre,
    objetivo,
    numSemanas,
    semanaActual: 1,
    esDeload: isDeloadWeek(1, numSemanas),
    notasBloque,
    semanaInicio,
  };
  const result = await generatePlanForUser(userId, ctx);

  // Si la semana 1 no se pudo generar, revertir el bloque (no dejarlo vacío).
  if (!result.ok) {
    await supabase.from('mesocycles').delete().eq('id', meso.id);
  }

  return result;
}

/**
 * Avanza a la siguiente semana del bloque activo y la genera (con el RPE real de
 * la semana anterior + el contexto del bloque, incluido el deload si toca).
 * Devuelve error claro si no hay bloque activo o si ya está en la última semana.
 */
export async function advanceMesocycleWeek(userId: string): Promise<GeneratePlanResult> {
  const supabase = createClient();

  const meso = await getActiveMesocycle(userId);
  if (!meso) {
    return { ok: false, status: 400, error: 'No hay un mesociclo activo. Empieza un bloque primero.' };
  }

  if (meso.semana_actual >= meso.num_semanas) {
    return {
      ok: false,
      status: 400,
      error: 'El bloque ya está en su última semana. Empieza un bloque nuevo cuando lo termines.',
    };
  }

  const siguiente = meso.semana_actual + 1;
  const semanaInicio = addWeeks(meso.semana_inicio, siguiente - 1);

  const ctx: MesocycleContext = {
    mesocycleId: meso.id,
    nombre: meso.nombre,
    objetivo: meso.objetivo ?? undefined,
    numSemanas: meso.num_semanas,
    semanaActual: siguiente,
    esDeload: isDeloadWeek(siguiente, meso.num_semanas),
    notasBloque: meso.notas_bloque ?? undefined,
    semanaInicio,
  };

  const result = await generatePlanForUser(userId, ctx);

  // Solo avanzamos el contador del bloque si la semana se generó bien.
  if (result.ok) {
    await supabase
      .from('mesocycles')
      .update({ semana_actual: siguiente })
      .eq('id', meso.id);
  }

  return result;
}

/**
 * Regenera la semana EN CURSO del bloque activo (sin avanzar el contador).
 * Reemplaza el plan de esa semana manteniendo el contexto del bloque.
 */
export async function regenerateCurrentMesocycleWeek(userId: string): Promise<GeneratePlanResult> {
  const meso = await getActiveMesocycle(userId);
  if (!meso) {
    return { ok: false, status: 400, error: 'No hay un mesociclo activo.' };
  }

  const semanaInicio = addWeeks(meso.semana_inicio, meso.semana_actual - 1);
  const ctx: MesocycleContext = {
    mesocycleId: meso.id,
    nombre: meso.nombre,
    objetivo: meso.objetivo ?? undefined,
    numSemanas: meso.num_semanas,
    semanaActual: meso.semana_actual,
    esDeload: isDeloadWeek(meso.semana_actual, meso.num_semanas),
    notasBloque: meso.notas_bloque ?? undefined,
    semanaInicio,
  };
  return generatePlanForUser(userId, ctx);
}
