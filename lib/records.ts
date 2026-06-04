import { createClient } from '@/lib/supabase/server';
import type { SerieRegistro } from '@/lib/workout';

/**
 * Récords e historial POR EJERCICIO.
 *
 * Mientras lib/progress.ts agrega métricas globales (volumen por sesión,
 * frecuencia), aquí miramos cada ejercicio por separado: cómo evoluciona en el
 * tiempo y cuáles son los récords personales (PRs). Es lo que necesita el
 * usuario para ver "estoy levantando más en banca que hace un mes".
 *
 * Mismo patrón que lib/progression.ts: la lógica PURA (buildExerciseRecords y
 * las funciones pequeñas como estimate1RM) está separada de la query de BD
 * (getExerciseRecords) para poder testearla en memoria, sin Supabase ni red.
 *
 * Solo cuentan las series con `completado: true` — registrar una serie sin
 * completarla no debe contar como trabajo hecho ni mover un PR.
 */

/**
 * Una fila de workout_logs tal como la consultamos. Una fila = un ejercicio en
 * una sesión; `sets` es el jsonb con sus series.
 */
export interface WorkoutLogRow {
  fecha: string; // YYYY-MM-DD
  ejercicio_wger_id: number;
  ejercicio_nombre: string;
  sets: unknown; // jsonb: array de SerieRegistro (lo validamos al leer)
}

/** Un punto del historial de un ejercicio: lo mejor de UNA sesión. */
export interface PuntoHistorial {
  fecha: string; // YYYY-MM-DD
  pesoTop: number; // peso máximo levantado en una serie completada esa sesión
  reps: number; // reps de esa serie de peso máximo (la "top set")
  e1rm: number; // 1RM estimado (Epley) de la mejor serie de esa sesión
}

/** Récords personales acumulados de un ejercicio a través de todas las sesiones. */
export interface ExercisePR {
  pesoMaxKg: number; // peso máximo levantado en cualquier serie completada
  e1rmMax: number; // mejor 1RM estimado en cualquier serie completada
  repsMax: number; // máximo de reps en una sola serie completada
}

/** Resumen completo de un ejercicio: PRs + historial cronológico. */
export interface ExerciseRecord {
  wgerId: number;
  nombre: string;
  pr: ExercisePR;
  historial: PuntoHistorial[]; // ordenado por fecha ascendente
}

/**
 * 1RM estimado por la fórmula de Epley: peso × (1 + reps/30).
 *
 * El 1RM (one-rep max) es el peso máximo teórico que podrías levantar UNA vez.
 * Medirlo de verdad es arriesgado, así que se estima a partir de series de más
 * reps. Lo usamos como métrica única de fuerza que combina peso Y reps: subir
 * de "40kg×8" a "40kg×10" es progreso aunque el peso no cambie, y el e1RM lo
 * captura. Epley es la fórmula estándar más simple.
 *
 * Redondeamos a 1 decimal para no arrastrar ruido de coma flotante.
 * Si reps es 0 (o el peso no es válido) devolvemos 0 — no hay levantamiento.
 */
export function estimate1RM(pesoKg: number, reps: number): number {
  if (!Number.isFinite(pesoKg) || !Number.isFinite(reps)) return 0;
  if (pesoKg <= 0 || reps <= 0) return 0;
  return Math.round(pesoKg * (1 + reps / 30) * 10) / 10;
}

/**
 * Devuelve solo las series COMPLETADAS de una fila, validando defensivamente el
 * jsonb (puede venir malformado o no ser un array).
 */
function seriesCompletadas(sets: unknown): SerieRegistro[] {
  if (!Array.isArray(sets)) return [];
  return (sets as SerieRegistro[]).filter(
    (s) =>
      s &&
      s.completado === true &&
      typeof s.peso_kg === 'number' &&
      typeof s.reps === 'number'
  );
}

/**
 * Lógica PURA: agrupa las filas de workout_logs por ejercicio (wger_id) a
 * través de todas las sesiones y devuelve, por ejercicio, su historial
 * cronológico y sus PRs.
 *
 * - Una sesión = una fecha. Si un ejercicio se entrenó varias veces el mismo
 *   día (varias filas con la misma fecha), juntamos sus series en el mismo
 *   punto de historial.
 * - El punto de historial de una sesión es su MEJOR serie: la de mayor e1RM
 *   (que es la métrica de fuerza). De esa serie tomamos pesoTop y reps.
 * - Los ejercicios sin ninguna serie completada se descartan por completo.
 *
 * Sin BD, sin red — testeable con datos en memoria.
 */
export function buildExerciseRecords(logs: WorkoutLogRow[]): ExerciseRecord[] {
  if (!logs || logs.length === 0) return [];

  // 1. Agrupar series completadas por ejercicio y, dentro, por fecha.
  //    Estructura: wgerId -> { nombre, porFecha: fecha -> SerieRegistro[] }
  const porEjercicio = new Map<
    number,
    { nombre: string; porFecha: Map<string, SerieRegistro[]> }
  >();

  for (const log of logs) {
    const completadas = seriesCompletadas(log.sets);
    if (completadas.length === 0) continue;

    let entry = porEjercicio.get(log.ejercicio_wger_id);
    if (!entry) {
      entry = { nombre: log.ejercicio_nombre, porFecha: new Map() };
      porEjercicio.set(log.ejercicio_wger_id, entry);
    }

    const existentes = entry.porFecha.get(log.fecha);
    if (existentes) {
      existentes.push(...completadas);
    } else {
      entry.porFecha.set(log.fecha, [...completadas]);
    }
  }

  // 2. Por cada ejercicio, construir historial (mejor serie por sesión) y PRs.
  const records: ExerciseRecord[] = [];

  for (const [wgerId, { nombre, porFecha }] of Array.from(porEjercicio.entries())) {
    const fechasOrdenadas = Array.from(porFecha.keys()).sort(); // YYYY-MM-DD ordena lexicográficamente

    const historial: PuntoHistorial[] = [];
    let pesoMaxKg = 0;
    let e1rmMax = 0;
    let repsMax = 0;

    for (const fecha of fechasOrdenadas) {
      const series = porFecha.get(fecha)!;

      // Mejor serie de la sesión = la de mayor e1RM. En empate, gana la de más
      // peso (criterio de desempate intuitivo para la "top set").
      let mejor = series[0];
      let mejorE1rm = estimate1RM(mejor.peso_kg, mejor.reps);
      for (const s of series) {
        const e = estimate1RM(s.peso_kg, s.reps);
        if (e > mejorE1rm || (e === mejorE1rm && s.peso_kg > mejor.peso_kg)) {
          mejor = s;
          mejorE1rm = e;
        }

        // Los PRs se calculan sobre TODAS las series, no solo la mejor de la
        // sesión: el peso máximo o las reps máximas pueden estar en otra serie.
        if (s.peso_kg > pesoMaxKg) pesoMaxKg = s.peso_kg;
        if (s.reps > repsMax) repsMax = s.reps;
        if (e > e1rmMax) e1rmMax = e;
      }

      historial.push({
        fecha,
        pesoTop: mejor.peso_kg,
        reps: mejor.reps,
        e1rm: mejorE1rm,
      });
    }

    records.push({
      wgerId,
      nombre,
      pr: { pesoMaxKg, e1rmMax, repsMax },
      historial,
    });
  }

  // 3. Ordenar los ejercicios por e1RM máximo descendente: los levantamientos
  //    más fuertes (y normalmente más relevantes) arriba.
  records.sort((a, b) => b.pr.e1rmMax - a.pr.e1rmMax);

  return records;
}

/**
 * Wrapper con BD: lee los workout_logs del usuario y delega en la lógica pura.
 * Devuelve el array de récords por ejercicio (vacío si no hay nada registrado).
 */
export async function getExerciseRecords(userId: string): Promise<ExerciseRecord[]> {
  const supabase = createClient();

  const { data: logs } = await supabase
    .from('workout_logs')
    .select('fecha, ejercicio_wger_id, ejercicio_nombre, sets')
    .eq('user_id', userId);

  return buildExerciseRecords((logs ?? []) as WorkoutLogRow[]);
}
