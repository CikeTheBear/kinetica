/**
 * Agregación de progreso a partir de workout_logs.
 *
 * Funciones PURAS (sin Supabase ni nada server-only): reciben las filas crudas
 * de workout_logs y devuelven los datos ya masticados para las gráficas. Así son
 * fáciles de testear y se pueden usar tanto en el server component del dashboard
 * como en tests unitarios.
 */

import type { SerieRegistro } from '@/lib/workout';

/** Fila de workout_logs en la forma que nos interesa para agregar. */
export interface WorkoutLogRow {
  fecha: string; // YYYY-MM-DD
  ejercicio_nombre: string;
  sets: SerieRegistro[]; // columna jsonb
}

export interface ProgressSummary {
  totalEntrenos: number; // días distintos con al menos una serie completada
  volumenTotalKg: number; // ∑ peso_kg * reps de todas las series completadas
  rachaSemanas: number; // semanas consecutivas (hasta la más reciente) con entreno
}

export interface PuntoVolumen {
  fecha: string; // YYYY-MM-DD
  volumenKg: number;
}

export interface PuntoFrecuencia {
  semanaInicio: string; // YYYY-MM-DD del lunes de esa semana
  entrenos: number; // días distintos entrenados esa semana
}

export interface ProgressData {
  summary: ProgressSummary;
  volumenPorSesion: PuntoVolumen[];
  frecuenciaSemanal: PuntoFrecuencia[];
}

/**
 * Volumen de una serie: peso × reps, solo si está completada. Defensivo ante
 * datos jsonb malformados (campos ausentes o no numéricos).
 */
function volumenSerie(s: SerieRegistro): number {
  if (!s || !s.completado) return 0;
  const peso = typeof s.peso_kg === 'number' ? s.peso_kg : 0;
  const reps = typeof s.reps === 'number' ? s.reps : 0;
  return peso * reps;
}

/** Volumen total (series completadas) de una fila de log. */
function volumenFila(row: WorkoutLogRow): number {
  if (!Array.isArray(row.sets)) return 0;
  return row.sets.reduce((acc, s) => acc + volumenSerie(s), 0);
}

/**
 * Lunes (inicio de semana) de una fecha YYYY-MM-DD, como YYYY-MM-DD.
 * Componentes locales para evitar el off-by-one por UTC (igual que lib/plan.ts).
 */
export function getWeekStart(fecha: string): string {
  const [y, m, d] = fecha.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  const dow = date.getDay(); // 0 = domingo ... 6 = sábado
  const diff = dow === 0 ? 6 : dow - 1; // días desde el lunes
  date.setDate(date.getDate() - diff);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Resta `semanas` semanas a un YYYY-MM-DD (que debería ser un lunes). */
function restarSemanas(weekStart: string, semanas: number): string {
  const [y, m, d] = weekStart.split('-').map((n) => parseInt(n, 10));
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - semanas * 7);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Agrega las filas de workout_logs en los datos para las gráficas.
 *
 * @param rows  filas de workout_logs del usuario
 * @param maxSesiones  cuántas sesiones recientes incluir en la gráfica de volumen
 * @param maxSemanas  cuántas semanas recientes incluir en la de frecuencia
 */
export function computeProgress(
  rows: WorkoutLogRow[],
  maxSesiones = 10,
  maxSemanas = 8
): ProgressData {
  // Volumen por fecha (sesión).
  const volumenPorFecha = new Map<string, number>();
  for (const row of rows) {
    volumenPorFecha.set(
      row.fecha,
      (volumenPorFecha.get(row.fecha) ?? 0) + volumenFila(row)
    );
  }

  const fechasOrdenadas = Array.from(volumenPorFecha.keys()).sort(); // YYYY-MM-DD ordena lexicográficamente

  const volumenPorSesion: PuntoVolumen[] = fechasOrdenadas
    .map((fecha) => ({ fecha, volumenKg: Math.round(volumenPorFecha.get(fecha)!) }))
    .slice(-maxSesiones);

  // Frecuencia: días distintos entrenados por semana.
  const diasPorSemana = new Map<string, Set<string>>();
  for (const fecha of fechasOrdenadas) {
    const semana = getWeekStart(fecha);
    if (!diasPorSemana.has(semana)) diasPorSemana.set(semana, new Set());
    diasPorSemana.get(semana)!.add(fecha);
  }

  // Construir las últimas `maxSemanas` semanas hasta la semana actual, rellenando
  // con 0 las semanas sin entreno (para que la gráfica no tenga huecos).
  const semanaActual = getWeekStart(hoyLocal());
  const frecuenciaSemanal: PuntoFrecuencia[] = [];
  for (let i = maxSemanas - 1; i >= 0; i--) {
    const semanaInicio = restarSemanas(semanaActual, i);
    frecuenciaSemanal.push({
      semanaInicio,
      entrenos: diasPorSemana.get(semanaInicio)?.size ?? 0,
    });
  }

  // Resumen.
  const volumenTotalKg = Math.round(
    rows.reduce((acc, row) => acc + volumenFila(row), 0)
  );
  const totalEntrenos = fechasOrdenadas.length;
  const rachaSemanas = calcularRacha(Array.from(diasPorSemana.keys()), semanaActual);

  return {
    summary: { totalEntrenos, volumenTotalKg, rachaSemanas },
    volumenPorSesion,
    frecuenciaSemanal,
  };
}

/**
 * Racha = semanas consecutivas con entreno contando hacia atrás desde la semana
 * actual. Si esta semana aún no se ha entrenado pero la pasada sí, la racha
 * arranca desde la semana pasada (no penalizamos por estar a mitad de semana).
 */
function calcularRacha(semanasConEntreno: string[], semanaActual: string): number {
  const set = new Set(semanasConEntreno);
  if (set.size === 0) return 0;

  // Punto de partida: la semana actual si tiene entreno, si no la anterior.
  let cursor = set.has(semanaActual)
    ? semanaActual
    : restarSemanas(semanaActual, 1);

  let racha = 0;
  while (set.has(cursor)) {
    racha++;
    cursor = restarSemanas(cursor, 1);
  }
  return racha;
}

/** Hoy como YYYY-MM-DD en componentes locales. */
function hoyLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
