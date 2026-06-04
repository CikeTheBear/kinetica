import { createClient } from '@/lib/supabase/server';
import type { SerieRegistro } from '@/lib/workout';

/**
 * Pieza B.1 del loop de progresión.
 *
 * Resume el rendimiento de la semana EN CURSO (el plan activo) comparando lo
 * PLANEADO contra lo REALMENTE registrado en el Ruedo, incluyendo el RPE real.
 * Ese resumen se inyecta en el prompt de generación del plan de la semana
 * SIGUIENTE (ver lib/plan.ts) para que Kai progrese la carga con datos en vez
 * de a ciegas.
 *
 * Importante: este módulo NO decide la progresión. Solo presenta los hechos de
 * forma legible y una señal ligera por ejercicio. La decisión (subir/mantener/
 * bajar) la toma Kai en el prompt — el cerebro vive en el LLM, no aquí. Esto es
 * deliberado: empezamos simple y dejamos la flexibilidad al coach; si en
 * pruebas el modelo resulta inconsistente, aquí es donde añadiríamos reglas
 * determinísticas como red de seguridad.
 *
 * La función de queries (getProgressionSummary) está separada de la lógica pura
 * (buildProgressionSummary) para poder testear la agregación sin tocar la BD.
 */

// Forma (parcial) de un ejercicio dentro de weekly_plans.plan_json.
interface EjercicioPlan {
  wger_id: number;
  nombre: string;
  sets: number;
  reps_objetivo: string;
  peso_sugerido_kg?: number;
  rpe_objetivo?: number;
}

// Forma (parcial) del plan_json que nos interesa.
export interface PlanJsonParcial {
  dias?: Array<{ ejercicios?: EjercicioPlan[] }>;
}

// Una fila de workout_logs tal como la consultamos (sets es el jsonb de series).
export interface WorkoutLogRow {
  ejercicio_wger_id: number;
  ejercicio_nombre: string;
  sets: unknown; // jsonb: array de SerieRegistro (lo validamos al leer)
}

// Objetivo del plan para un ejercicio (lo que se pretendía hacer).
interface Objetivo {
  nombre: string;
  reps_objetivo: string;
  peso_sugerido_kg?: number;
  rpe_objetivo?: number;
}

/**
 * Lógica PURA: dado el plan_json y las filas de logs, compone el bloque de
 * texto de rendimiento (o null si no hay series completadas que resumir).
 * Sin BD, sin red — testeable con datos en memoria.
 */
export function buildProgressionSummary(
  planJson: PlanJsonParcial | null | undefined,
  logs: WorkoutLogRow[]
): string | null {
  if (!logs || logs.length === 0) return null;

  // 1. Indexar los objetivos del plan por wger_id. Si un ejercicio aparece en
  //    varios días, nos quedamos con la primera definición (suele ser idéntica).
  const objetivos = new Map<number, Objetivo>();
  for (const dia of planJson?.dias ?? []) {
    for (const ej of dia.ejercicios ?? []) {
      if (!objetivos.has(ej.wger_id)) {
        objetivos.set(ej.wger_id, {
          nombre: ej.nombre,
          reps_objetivo: ej.reps_objetivo,
          peso_sugerido_kg: ej.peso_sugerido_kg,
          rpe_objetivo: ej.rpe_objetivo,
        });
      }
    }
  }

  // 2. Agrupar las series COMPLETADAS por ejercicio (un wger_id puede haberse
  //    entrenado en varios días; juntamos todas sus series).
  const seriesPorEjercicio = new Map<number, { nombre: string; series: SerieRegistro[] }>();
  for (const log of logs) {
    const series = (Array.isArray(log.sets) ? log.sets : []) as SerieRegistro[];
    const completadas = series.filter((s) => s.completado);
    if (completadas.length === 0) continue;

    const entry = seriesPorEjercicio.get(log.ejercicio_wger_id);
    if (entry) {
      entry.series.push(...completadas);
    } else {
      seriesPorEjercicio.set(log.ejercicio_wger_id, {
        nombre: log.ejercicio_nombre,
        series: [...completadas],
      });
    }
  }

  if (seriesPorEjercicio.size === 0) return null;

  // 3. Componer una línea por ejercicio: plan vs realidad + señal.
  const lineas: string[] = [];
  for (const [wgerId, { nombre, series }] of Array.from(seriesPorEjercicio.entries())) {
    const objetivo = objetivos.get(wgerId);

    // Peso de trabajo: el máximo levantado en las series completadas.
    const pesoTrabajo = Math.max(...series.map((s) => s.peso_kg));
    // Reps típicas: media redondeada de las completadas.
    const repsMedia = Math.round(
      series.reduce((acc, s) => acc + s.reps, 0) / series.length
    );
    // RPE real: media de los RPE marcados (ignora las series sin marcar).
    const rpes = series.map((s) => s.rpe).filter((r): r is number => typeof r === 'number');
    const rpeReal =
      rpes.length > 0 ? +(rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null;

    const planTxt = objetivo
      ? `plan ${objetivo.reps_objetivo} reps${
          objetivo.peso_sugerido_kg != null ? ` @ ${objetivo.peso_sugerido_kg}kg` : ''
        }${objetivo.rpe_objetivo != null ? ` (RPE obj ${objetivo.rpe_objetivo})` : ''}`
      : 'sin objetivo en plan';

    const realTxt = `hizo ${series.length} series ~${pesoTrabajo}kg ×${repsMedia}${
      rpeReal != null ? `, RPE real ${rpeReal}` : ', RPE no registrado'
    }`;

    lineas.push(
      `- ${nombre}: ${planTxt} → ${realTxt} [${progressionSignal(objetivo?.rpe_objetivo, rpeReal)}]`
    );
  }

  return [
    '=== RENDIMIENTO DE LA SEMANA EN CURSO (plan vs realidad) ===',
    'Usa estos datos para progresar la carga de la semana que generes (ver reglas de progresión).',
    ...lineas,
    '============================================================',
  ].join('\n');
}

/**
 * Señal ligera de progresión a partir del RPE objetivo vs el real.
 * Es solo una pista para el modelo; la decisión final es suya.
 *
 * Exportada para testearla directamente: es la regla que más nos interesa
 * blindar (umbrales de subir/mantener/bajar).
 */
export function progressionSignal(
  rpeObjetivo: number | undefined,
  rpeReal: number | null
): string {
  if (rpeReal == null) return 'sin RPE — no hay señal de esfuerzo';
  if (rpeObjetivo == null) return `RPE real ${rpeReal}`;

  const diff = rpeReal - rpeObjetivo;
  if (diff <= -1.5) return 'sobró margen → candidato a SUBIR carga';
  if (diff >= 1) return 'al límite → MANTENER o reducir';
  return 'en objetivo → progresión ligera o mantener';
}

/**
 * Wrapper con BD: obtiene el plan activo y sus logs, y delega en la lógica pura.
 * Devuelve el bloque de texto listo para el prompt, o null si no hay nada que
 * resumir (sin plan activo o sin entrenamientos registrados).
 */
export async function getProgressionSummary(userId: string): Promise<string | null> {
  const supabase = createClient();

  // 1. Plan activo: la semana en curso, de la que aprendemos para la siguiente.
  const { data: plan } = await supabase
    .from('weekly_plans')
    .select('id, plan_json')
    .eq('user_id', userId)
    .eq('estado', 'active')
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .single();

  if (!plan) return null;

  // 2. Logs registrados contra ese plan.
  const { data: logs } = await supabase
    .from('workout_logs')
    .select('ejercicio_wger_id, ejercicio_nombre, sets')
    .eq('user_id', userId)
    .eq('weekly_plan_id', plan.id);

  return buildProgressionSummary(plan.plan_json as PlanJsonParcial, (logs ?? []) as WorkoutLogRow[]);
}
