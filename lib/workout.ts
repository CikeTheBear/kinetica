/**
 * Helpers y tipos para "En el Ruedo" — el modo de ejecución del entrenamiento.
 *
 * Este módulo NO importa nada server-only (ni Supabase ni next/headers), así que
 * sus tipos y funciones puras se pueden usar tanto en el server component que
 * carga el plan como en los componentes cliente que registran las series.
 */

// Orden canónico de los días tal como los genera el plan (lib/plan.ts).
export const DIAS_SEMANA = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const;

export type DiaSemana = (typeof DIAS_SEMANA)[number];

/**
 * Una serie registrada por el usuario durante el entrenamiento.
 * Es la unidad que se guarda dentro del jsonb `sets` de workout_logs.
 */
export interface SerieRegistro {
  serie: number; // número de serie, 1-indexado
  peso_kg: number;
  reps: number;
  completado: boolean;
  // RPE real (Rate of Perceived Exertion, 1-10): cómo se sintió la serie DE
  // VERDAD, capturado tras completarla. Es la señal que alimenta el motor de
  // progresión: comparado contra rpe_objetivo del plan, le dice a Kai si subir
  // carga (sobró) o mantener/bajar (al límite). Opcional: si el usuario no lo
  // marca, simplemente no hay dato de esfuerzo para esa serie.
  rpe?: number;
}

/**
 * Niveles de esfuerzo percibido que ofrecemos al usuario tras completar una
 * serie. Tres cubos en vez de una escala 1-10 para bajar la fricción a un tap
 * durante el entreno. El valor numérico es lo que se guarda y lo que el motor
 * de progresión compara contra el rpe_objetivo del plan:
 *  - facil: sobraron reps (~4 en reserva)  → señal de subir carga
 *  - justo: cerca del objetivo típico (~2 en reserva)
 *  - duro:  al límite / fallo técnico (0-1 en reserva) → mantener o bajar
 */
export const RPE_NIVELES = [
  { id: 'facil', valor: 6 },
  { id: 'justo', valor: 8 },
  { id: 'duro', valor: 10 },
] as const;

export type RpeNivelId = (typeof RPE_NIVELES)[number]['id'];

/**
 * Un ejercicio con todas sus series registradas. Cada uno se persiste como
 * UNA fila en workout_logs (con `series` dentro de la columna jsonb `sets`).
 */
export interface EjercicioRegistro {
  wger_id: number;
  nombre: string;
  series: SerieRegistro[];
}

/**
 * Payload que el cliente envía a POST /api/workout/log al finalizar el entreno.
 */
export interface WorkoutLogPayload {
  weekly_plan_id: string;
  fecha: string; // YYYY-MM-DD
  ejercicios: EjercicioRegistro[];
}

/**
 * Parsea el `reps_objetivo` del plan (un string libre como "6-8", "10",
 * "12-15", "AMRAP") y devuelve un número con el que pre-rellenar el input.
 *
 * Criterio: si es un rango "a-b", tomamos el extremo SUPERIOR (la meta a la que
 * se aspira). Si es un número suelto, ese número. Si no se puede parsear
 * (p.ej. "AMRAP"), caemos a un default razonable (10).
 */
export function parseRepsObjetivo(repsObjetivo: string): number {
  const numeros = repsObjetivo.match(/\d+/g);
  if (!numeros || numeros.length === 0) return 10;
  // El último número del string captura tanto "10" como el tope de "6-8".
  const valor = parseInt(numeros[numeros.length - 1], 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 10;
}

/**
 * Dada la fecha del lunes de la semana (semana_inicio, YYYY-MM-DD) y un día,
 * calcula la fecha real de ese día como YYYY-MM-DD.
 *
 * Igual que getNextMonday en lib/plan.ts: trabajamos con componentes de fecha
 * LOCALES para evitar el off-by-one por conversión a UTC en GMT-4.
 */
export function getFechaForDia(semanaInicio: string, dia: DiaSemana): string {
  const offset = DIAS_SEMANA.indexOf(dia); // lunes=0 ... domingo=6
  if (offset === -1) return semanaInicio;

  const [year, month, day] = semanaInicio.split('-').map((n) => parseInt(n, 10));
  // month - 1 porque el constructor de Date usa meses 0-indexados.
  const fecha = new Date(year, month - 1, day);
  fecha.setDate(fecha.getDate() + offset);

  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
